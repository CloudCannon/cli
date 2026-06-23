import { createReadStream } from 'node:fs';
import { open, readdir, readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, relative } from 'node:path';
import process from 'node:process';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
	'.html': 'text/html',
	'.js': 'application/javascript',
	'.mjs': 'application/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.txt': 'text/plain',
	'.md': 'text/markdown',
};

const TEMPLATES_DIR = fileURLToPath(new URL('../templates/', import.meta.url));

const ROUTES = {
	index: new URLPattern({ pathname: '/{index.html}?' }),
	editor: new URLPattern({ pathname: '/app/assets/e2e/omnipage/editor.html' }),
	source: new URLPattern({ pathname: '/__source/*' }),
	apiListing: new URLPattern({ pathname: '/__api/listing' }),
	apiOutputDir: new URLPattern({ pathname: '/__api/output_dir' }),
	output: new URLPattern({ pathname: '/__output/*' }),
};

const DEV_SERVER_ORIGIN: string = process.env.DEV_SERVER_ORIGIN ?? 'https://cdn.cloudcannon.com';
const DEV_SERVER_ENTRYPOINT: string = process.env.DEV_SERVER_ENTRYPOINT ?? '/site-router-embed.js';
const DEV_SERVER_SHARED_ENTRYPOINT: string =
	process.env.DEV_SERVER_SHARED_ENTRYPOINT ?? '/shared.js';
const DEV_SERVER_STYLES_ENTRYPOINT: string =
	process.env.DEV_SERVER_STYLES_ENTRYPOINT ?? '/redesign.css';

let DEV_SERVER_PREFIX: string | undefined = process.env.DEV_SERVER_PREFIX;

if (!DEV_SERVER_PREFIX && Boolean(process.env.USE_BETA_ASSETS)) {
	DEV_SERVER_PREFIX = '/staging-dev-server';
}
if (!DEV_SERVER_PREFIX) {
	DEV_SERVER_PREFIX = '/production-dev-server';
}

function getContentType(filepath: string): string {
	const ext = extname(filepath).toLowerCase();
	return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

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
		return new Response('Internal Server Error', { status: 500 });
	}
}

async function serveTemplate(filename: string, port: number): Promise<Response> {
	try {
		const contents = (await readFile(join(TEMPLATES_DIR, filename), 'utf-8')).replace(
			'{{ DEV_SERVER_PORT }}',
			String(port)
		);
		return new Response(contents, {
			headers: { 'Content-Type': 'text/html' },
		});
	} catch {
		return new Response('Internal Server Error', { status: 500 });
	}
}

async function serveIndexHtml(port: number): Promise<Response> {
	try {
		let contents = await readFile(join(TEMPLATES_DIR, 'index.html'), 'utf-8');
		contents = contents
			.replace(
				'{{ DEV_SERVER_ENTRYPOINT }}',
				`${DEV_SERVER_ORIGIN}${DEV_SERVER_PREFIX}${DEV_SERVER_ENTRYPOINT}`
			)
			.replace('{{ DEV_SERVER_PORT }}', String(port))
			.replace(
				'{{ DEV_SERVER_SHARED_ENTRYPOINT }}',
				`${DEV_SERVER_ORIGIN}${DEV_SERVER_PREFIX}${DEV_SERVER_SHARED_ENTRYPOINT}`
			)
			.replace(
				'{{ DEV_SERVER_STYLES_ENTRYPOINT }}',
				`${DEV_SERVER_ORIGIN}${DEV_SERVER_PREFIX}${DEV_SERVER_STYLES_ENTRYPOINT}`
			);
		return new Response(contents, {
			headers: { 'Content-Type': 'text/html' },
		});
	} catch {
		return new Response('Internal Server Error', { status: 500 });
	}
}

async function getGitignorePatterns(dir: string): Promise<string[]> {
	try {
		const content = await readFile(join(dir, '.gitignore'), 'utf-8');
		return content
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith('#'));
	} catch {
		return [];
	}
}

function matchesGitignore(
	path: string,
	patterns: string[],
	isDirectory: boolean,
	outputPath: string
): boolean {
	if (path.includes(outputPath)) return false;

	for (const pattern of patterns) {
		const cleanPattern = pattern.replace(/\/$/, '');
		const patternIsDir = pattern.endsWith('/');
		if (patternIsDir && !isDirectory) continue;

		if (cleanPattern.includes('/')) {
			if (path === cleanPattern || path.startsWith(`${cleanPattern}/`)) {
				return true;
			}
		} else {
			const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
			if (name === cleanPattern) return true;
			if (path === cleanPattern || path.startsWith(`${cleanPattern}/`)) return true;
		}
	}
	return false;
}

async function getFileListing(dir: string, outputPath: string): Promise<string[]> {
	const files: string[] = [];
	const patterns = await getGitignorePatterns(dir);

	async function walk(currentPath: string): Promise<void> {
		const entries = await readdir(currentPath, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(currentPath, entry.name);
			const relPath = relative(dir, fullPath);
			if (matchesGitignore(relPath, patterns, entry.isDirectory(), outputPath)) continue;
			if (entry.isFile()) {
				files.push(relPath);
			} else if (entry.isDirectory()) {
				await walk(fullPath);
			}
		}
	}

	await walk(dir);
	return files;
}

export interface DevServerOptions {
	outputPath: string;
	port?: number;
}

export interface DevServerConfig {
	outputPath: string;
	port: number;
}

export interface DevServerHandle {
	port: number;
	url: string;
	close(): Promise<void>;
}

async function messageToWebRequest(req: IncomingMessage): Promise<Request> {
	const host = req.headers.host ?? 'localhost';
	const url = `http://${host}${req.url ?? '/'}`;
	const headers = new Headers();
	for (const [key, value] of Object.entries(req.headers)) {
		if (value === undefined) continue;
		if (Array.isArray(value)) {
			for (const v of value) headers.append(key, v);
		} else {
			headers.set(key, value);
		}
	}

	// The dev server is a static file server. None of the handlers read the
	// request body, so we don't forward it. Constructing a Request with a
	// ReadableStream body in Node 24 also requires the `duplex: 'half'` init
	// option, which we'd rather not deal with.
	const method = req.method ?? 'GET';
	return new Request(url, { method, headers });
}

async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
	res.statusCode = response.status;
	res.statusMessage = response.statusText ?? '';

	const skipBody =
		response.status === 204 || response.status === 304 || (res.req.method ?? 'GET') === 'HEAD';

	response.headers.forEach((value, key) => {
		// Skip hop-by-hop headers that we shouldn't forward as-is.
		if (key.toLowerCase() === 'connection') return;
		res.setHeader(key, value);
	});

	if (skipBody || !response.body) {
		res.end();
		return;
	}

	const reader = response.body.getReader();
	return new Promise<void>((resolve, reject) => {
		res.on('error', reject);
		reader
			.read()
			.then(async ({ done, value }) => {
				if (done) {
					res.end();
					return;
				}
				res.write(value);
				while (true) {
					const next = await reader.read();
					if (next.done) {
						res.end();
						return;
					}
					res.write(next.value);
				}
			})
			.catch((err) => {
				reject(err);
			})
			.finally(() => {
				res.off('error', reject);
				resolve();
			});
	});
}

async function handleRoute(
	url: URL,
	cwd: string,
	port: number,
	outputPath: string
): Promise<Response> {
	if (ROUTES.index.test(url)) {
		return await serveIndexHtml(port);
	}
	if (ROUTES.editor.test(url)) {
		return await serveTemplate('editor.html', port);
	}

	const sourceMatch = ROUTES.source.exec(url);
	if (sourceMatch) {
		const path = sourceMatch.pathname.groups[0] ?? '';
		return await serveFileContents(join(cwd, path));
	}

	if (ROUTES.apiListing.test(url)) {
		try {
			const files = await getFileListing(cwd, outputPath);
			return new Response(JSON.stringify(files), {
				headers: { 'Content-Type': 'application/json' },
			});
		} catch {
			return new Response('Internal Server Error', { status: 500 });
		}
	}

	if (ROUTES.apiOutputDir.test(url)) {
		const normalized = outputPath.replace(/^\/+|\/+$/g, '');
		return new Response(JSON.stringify(normalized), {
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const outputMatch = ROUTES.output.exec(url);
	if (outputMatch) {
		const path = outputMatch.pathname.groups[0] ?? '';
		return await serveFileContents(join(cwd, outputPath, path));
	}

	return await serveFileContents(join(cwd, outputPath, url.pathname));
}

async function handleRequest(
	request: Request,
	cwd: string,
	port: number,
	outputPath: string
): Promise<Response> {
	const url = new URL(request.url);
	const start = performance.now();
	const response = await handleRoute(url, cwd, port, outputPath);
	const duration = (performance.now() - start).toFixed(2);
	console.log(`${request.method} ${url.pathname} ${response.status} ${duration}ms`);
	return response;
}

export async function startDevServer(port: number, outputPath: string): Promise<DevServerHandle> {
	const cwd = process.cwd();
	const server = createServer(async (req, res) => {
		try {
			const request = await messageToWebRequest(req);
			const response = await handleRequest(request, cwd, port, outputPath);
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

	console.log(`CloudCannon dev server running at ${url}`);
	console.log(`Serving output from: ${outputPath}`);

	return {
		port: actualPort,
		url,
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.close((err) => {
					if (err) reject(err);
					else resolve();
				});
			}),
	};
}
