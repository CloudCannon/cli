import { createReadStream, existsSync } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { userInfo } from 'node:os';
import { basename, dirname, join, relative, sep } from 'node:path';
import process from 'node:process';
import { Readable } from 'node:stream';
import chokidar, { type FSWatcher } from 'chokidar';
import { text } from '../configure/utility.ts';
import { TEMPLATE_SUBSTITUTIONS, TEMPLATES_DIR } from './constants.ts';
import {
	getContentType,
	getFileInfo,
	getGitignorePatterns,
	isLikelyBinary,
	listFiles,
	titleizeDirname,
} from './file-helpers.ts';
import {
	getRequestURL,
	readRequestBody,
	readRequestBodyToJSON,
	sendResponse,
} from './http-helpers.ts';
import {
	checkPath,
	createRoute,
	execRoute,
	testRoute,
	type UncheckedPath,
} from './route-helpers.ts';

export interface DevServerOptions {
	liveSync: boolean;
	appSync: boolean;
	verbose: boolean;
}

interface FileOperationsBody {
	paths: {
		source?: UncheckedPath;
		target: UncheckedPath;
	}[];
	allow_overwrite?: boolean;
}

const SSE_CLIENTS: Set<ServerResponse> = new Set();
const UPDATED_REMOTELY: Record<string, boolean> = {};
const ROUTES = {
	index: createRoute('/{index.html}?', /^\/(?:index\.html)?$/),
	editor: createRoute(
		'/app/assets/e2e/omnipage/editor.html',
		/^\/app\/assets\/e2e\/omnipage\/editor\.html$/
	),
	source: createRoute('/__source/*', /^\/__source\/(.*)$/),
	apiDetails: createRoute('/__api/details', /^\/__api\/details$/),
	apiMegafile: createRoute('/__api/megafile', /^\/__api\/megafile$/),
	apiEvents: createRoute('/__api/events', /^\/__api\/events$/),
	apiMovePath: createRoute('/__api/move_path', /^\/__api\/move_path$/),
	apiDeletePath: createRoute('/__api/delete_path', /^\/__api\/delete_path$/),
	apiUpload: createRoute('/__api/upload/*', /^\/__api\/upload\/(.*)$/),
	apiFileInfo: createRoute('/__api/file/*', /^\/__api\/file\/(.*)$/),
	output: createRoute('/__output/*', /^\/__output\/(.*)$/),
};

async function serveFileContents(filepath: string): Promise<Response> {
	try {
		const fd = await open(filepath);
		const stream = createReadStream('', { fd });
		const webStream = Readable.toWeb(stream);
		return new Response(webStream, {
			headers: { 'Content-Type': getContentType(filepath) },
		});
	} catch (err: unknown) {
		if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
			return new Response('Not Found', { status: 404 });
		}
		throw err;
	}
}

async function serveFileInfo(path: string): Promise<Response> {
	try {
		const payload = await getFileInfo(path);
		return new Response(JSON.stringify(payload), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (err: unknown) {
		if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
			return new Response('Not Found', { status: 404 });
		}
		throw err;
	}
}

async function serveMegafile(cwd: string, outputPath: string): Promise<Response> {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller: ReadableStreamDefaultController): Promise<void> {
			try {
				const files = await listFiles(cwd, outputPath);
				for (const file of files) {
					if (file.startsWith(outputPath)) {
						continue;
					}

					if (isLikelyBinary(file)) {
						continue;
					}

					try {
						const relPath = relative(cwd, file);
						const payload = await getFileInfo(file);
						controller.enqueue(
							encoder.encode(
								`${JSON.stringify({ filename: relPath.replaceAll(sep, '/'), payload })}\n`
							)
						);
					} catch {}
				}
			} catch (err: unknown) {
				controller.error(err);
				return;
			}
			controller.close();
		},
	});
	return new Response(stream, {
		headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
	});
}

async function serveTemplate(filename: string, port: number): Promise<Response> {
	let contents = await readFile(join(TEMPLATES_DIR, filename), 'utf-8');
	for (const [placeholder, resolve] of Object.entries(TEMPLATE_SUBSTITUTIONS)) {
		contents = contents.replaceAll(placeholder, resolve(port));
	}
	return new Response(contents, {
		headers: { 'Content-Type': 'text/html' },
	});
}

function broadcastSse(event: string, data: unknown): void {
	if (SSE_CLIENTS.size === 0) return;
	const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
	for (const client of SSE_CLIENTS) {
		try {
			client.write(payload);
		} catch {
			SSE_CLIENTS.delete(client);
		}
	}
}

function handleSseRequest(req: IncomingMessage, res: ServerResponse): void {
	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-store',
		Connection: 'keep-alive',
		'Access-Control-Allow-Origin': '*',
		'X-Accel-Buffering': 'no',
	});
	// Comment frame keeps the connection alive and flushes headers.
	res.write(': connected\n\n');

	SSE_CLIENTS.add(res);

	const cleanup = (): void => {
		SSE_CLIENTS.delete(res);
	};
	req.on('close', cleanup);
	req.on('error', cleanup);
	res.on('error', cleanup);
	res.on('close', cleanup);
}

async function handleUploadRequest(
	cwd: string,
	path: string,
	req: IncomingMessage
): Promise<Response> {
	const body = await readRequestBody(req);
	if (existsSync(path)) {
		UPDATED_REMOTELY[path] = true;
		console.log(
			`${text.good('↓ synced')} ${text.value(relative(cwd, path))} ${text.secondary('(edit)')}`
		);
	} else {
		console.log(
			`${text.good('↓ synced')} ${text.value(relative(cwd, path))} ${text.secondary('(create)')}`
		);
	}
	await writeFile(path, body);

	return new Response('<ETag>"etag"</ETag>', {
		headers: { 'Content-Type': 'text/xml' },
	});
}

async function handleMovePathRequest(cwd: string, req: IncomingMessage): Promise<Response> {
	let body: FileOperationsBody;
	try {
		body = (await readRequestBodyToJSON(req)) as FileOperationsBody;
	} catch {
		return new Response('Invalid JSON body', { status: 400 });
	}

	if (!Array.isArray(body.paths) || body.paths.length === 0) {
		return new Response('Missing paths', { status: 400 });
	}

	for (const op of body.paths) {
		if (!op.source || !op.target) {
			return new Response('Each path operation requires source and target', { status: 400 });
		}
		const source = checkPath(cwd, op.source);
		const target = checkPath(cwd, op.target);

		try {
			await stat(source);
		} catch {
			return new Response(`Source not found: ${op.source}`, { status: 404 });
		}

		if (!body.allow_overwrite && existsSync(target)) {
			return new Response(`Target already exists: ${op.target}`, { status: 409 });
		}

		await mkdir(dirname(target), { recursive: true });
		await rename(source, target);
		console.log(
			`${text.good('↓ synced')} ${text.value(relative(cwd, source))} ${text.secondary('→')} ${text.value(relative(cwd, target))}`
		);
	}

	return new Response(JSON.stringify({ success: true }), {
		headers: { 'Content-Type': 'application/json' },
	});
}

async function handleDeletePathRequest(cwd: string, req: IncomingMessage): Promise<Response> {
	let body: FileOperationsBody;
	try {
		body = (await readRequestBodyToJSON(req)) as FileOperationsBody;
	} catch {
		return new Response('Invalid JSON body', { status: 400 });
	}

	if (!Array.isArray(body.paths) || body.paths.length === 0) {
		return new Response('Missing paths', { status: 400 });
	}

	for (const op of body.paths) {
		if (!op.target) {
			return new Response('Each path operation requires target', { status: 400 });
		}
		const target = checkPath(cwd, op.target);

		try {
			await stat(target);
		} catch {
			continue;
		}

		await rm(target, { recursive: true });
		console.log(
			`${text.good('↓ synced')} ${text.value(relative(cwd, target))} ${text.secondary('(delete)')}`
		);
	}

	return new Response(JSON.stringify({ success: true }), {
		headers: { 'Content-Type': 'application/json' },
	});
}

async function startFileWatcher(cwd: string, outputPath: string): Promise<FSWatcher> {
	const gitIgnore = await getGitignorePatterns(cwd, outputPath);

	const watcher = chokidar.watch(cwd, {
		ignoreInitial: true,
		ignored: (path: string) => {
			const name = basename(path);
			if (name === '.git' || name === 'node_modules') {
				return true;
			}

			const relativePath = relative(cwd, path);
			if (!relativePath || !gitIgnore) {
				return false;
			}

			return gitIgnore.ignores(relativePath);
		},
	});

	let outputChangeEventPaths: string[] = [];
	let outputChangeEventTimeout: NodeJS.Timeout | undefined;
	function emitOutputChangeEvent(path: string): void {
		outputChangeEventPaths.push(`/${path.replaceAll(sep, '/')}`);

		if (outputChangeEventTimeout) {
			clearTimeout(outputChangeEventTimeout);
		}
		outputChangeEventTimeout = setTimeout(() => {
			const count = outputChangeEventPaths.length;
			console.log(
				`${text.em('⟳ output synced')} ${text.value(`${count} file${count === 1 ? '' : 's'}`)}`
			);
			broadcastSse('output-change', { paths: outputChangeEventPaths });
			outputChangeEventTimeout = undefined;
			outputChangeEventPaths = [];
		}, 200);
	}

	const fileChangeEventTimeouts: Record<string, NodeJS.Timeout | undefined> = {};
	function emitFileEvent(type: string, path: string): void {
		const timeout = fileChangeEventTimeouts[path];

		if (timeout) {
			clearTimeout(timeout);
		}
		fileChangeEventTimeouts[path] = setTimeout(() => {
			const tag = `(${type.replace('file-', '')})`;
			console.log(`${text.em('↑ synced')} ${text.value(path)} ${text.secondary(tag)}`);
			broadcastSse(type, { path });
			fileChangeEventTimeouts[path] = undefined;
		}, 200);
	}

	watcher.on('all', (event, path) => {
		const relativePath = relative(cwd, path);
		const fileOutputPath = relative(outputPath, path);

		if (!fileOutputPath.startsWith('..')) {
			emitOutputChangeEvent(fileOutputPath);
			return;
		}

		let type: string | undefined;

		if (UPDATED_REMOTELY[path]) {
			UPDATED_REMOTELY[path] = false;
			return;
		}

		if (event === 'unlink') {
			type = 'file-delete';
		}

		if (event === 'add') {
			type = 'file-create';
		}

		if (event === 'change') {
			type = 'file-edit';
		}

		if (type) {
			emitFileEvent(type, `/${relativePath.replaceAll(sep, '/')}`);
		}
	});

	return watcher;
}

async function handleGetRoute(
	url: URL,
	cwd: string,
	port: number,
	outputPath: string
): Promise<Response> {
	if (testRoute(ROUTES.index, url)) {
		return serveTemplate('index.html', port);
	}
	if (testRoute(ROUTES.editor, url)) {
		return serveTemplate('editor.html', port);
	}

	const sourceMatch = execRoute(ROUTES.source, url);
	if (sourceMatch) {
		return serveFileContents(checkPath(cwd, sourceMatch));
	}

	if (testRoute(ROUTES.apiDetails, url)) {
		const siteName = titleizeDirname(cwd);
		const outputDir = relative(cwd, outputPath).replaceAll(sep, '/');
		const sourceFiles = (await listFiles(cwd, outputPath)).map((path) =>
			relative(cwd, path).replaceAll(sep, '/')
		);
		let userName: string | undefined;
		try {
			userName = userInfo().username?.trim();
		} catch {}
		return new Response(JSON.stringify({ sourceFiles, outputDir, siteName, userName }), {
			headers: { 'Content-Type': 'application/json' },
		});
	}

	if (testRoute(ROUTES.apiMegafile, url)) {
		return serveMegafile(cwd, outputPath);
	}

	const fileInfoMatch = execRoute(ROUTES.apiFileInfo, url);
	if (fileInfoMatch) {
		return serveFileInfo(checkPath(cwd, fileInfoMatch));
	}

	const outputMatch = execRoute(ROUTES.output, url) || url.pathname;
	if (outputMatch) {
		return serveFileContents(checkPath(outputPath, outputMatch));
	}

	return new Response('Not Found', { status: 404 });
}

function logRequest(req: IncomingMessage, url: URL, status: number, duration: number): void {
	console.log(
		`${text.secondary(req.method ?? 'GET')} ${text.secondary(url.pathname)} ${text.secondary(String(status))} ${text.secondary(`${duration.toFixed(2)}ms`)}`
	);
}

async function handleGetRequest(
	req: IncomingMessage,
	cwd: string,
	port: number,
	outputPath: string,
	verbose: boolean
): Promise<Response> {
	const url = getRequestURL(req);
	const start = performance.now();
	const response = await handleGetRoute(url, cwd, port, outputPath);
	if (verbose) {
		logRequest(req, url, response.status, performance.now() - start);
	}
	return response;
}

async function handlePostRequest(
	req: IncomingMessage,
	cwd: string,
	url: URL,
	verbose: boolean
): Promise<Response> {
	const start = performance.now();
	let response: Response;

	const uploadMatch = execRoute(ROUTES.apiUpload, url);
	if (uploadMatch) {
		response = await handleUploadRequest(cwd, checkPath(cwd, uploadMatch), req);
	} else if (testRoute(ROUTES.apiMovePath, url)) {
		response = await handleMovePathRequest(cwd, req);
	} else if (testRoute(ROUTES.apiDeletePath, url)) {
		response = await handleDeletePathRequest(cwd, req);
	} else {
		response = new Response('Not Found', { status: 404 });
	}

	if (verbose) {
		logRequest(req, url, response.status, performance.now() - start);
	}
	return response;
}

export async function startDevServer(
	port: number,
	outputPath: UncheckedPath,
	options: DevServerOptions
): Promise<() => Promise<void>> {
	const { liveSync, appSync, verbose } = options;
	const cwd = process.cwd();
	const checkedOutputPath = checkPath(cwd, outputPath);

	const watcher = liveSync ? await startFileWatcher(cwd, checkedOutputPath) : null;
	const server = createServer(async (req, res) => {
		const url = getRequestURL(req);

		try {
			if (testRoute(ROUTES.apiEvents, url)) {
				handleSseRequest(req, res);
				return;
			}

			if (req.method === 'POST') {
				if (!appSync) {
					await sendResponse(res, new Response('App sync is disabled', { status: 403 }));
					return;
				}

				const response = await handlePostRequest(req, cwd, url, verbose);
				await sendResponse(res, response);
				return;
			}

			const response = await handleGetRequest(req, cwd, port, checkedOutputPath, verbose);
			await sendResponse(res, response);
		} catch (err: unknown) {
			console.error(err);
			if (!res.headersSent) {
				res.statusCode = 500;
				res.setHeader('Content-Type', 'text/plain');
			}
			res.end('Internal Server Error');
		}
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, () => {
			server.off('error', reject);
			resolve();
		});
	});

	const addr = server.address();
	const actualPort = typeof addr === 'object' && addr ? addr.port : port;
	const url = `http://localhost:${actualPort}`;

	console.log(`${text.good('CloudCannon dev server running at')} ${text.em(url)}`);
	console.log(`${text.secondary('Serving output from')} ${text.value(checkedOutputPath)}`);
	if (liveSync) {
		console.log(`${text.secondary('Watching for file changes in')} ${text.value(cwd)}`);
	} else {
		console.log(text.secondary('Live sync from disk is disabled'));
	}
	if (!appSync) {
		console.log(text.secondary('App sync (writes from the web app) is disabled'));
	}

	return async () => {
		for (const client of SSE_CLIENTS) {
			try {
				client.end();
			} catch {}
		}
		SSE_CLIENTS.clear();
		await watcher?.close().catch(() => {});
		await new Promise<void>((resolve, reject) => {
			server.close((err) => {
				if (err) reject(err);
				else resolve();
			});
		});
	};
}
