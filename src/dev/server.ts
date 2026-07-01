import { createReadStream } from 'node:fs';
import { open, readdir, readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { userInfo } from 'node:os';
import { basename, extname, join, relative } from 'node:path';
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

interface Route {
	test(url: URL): boolean;
	exec(url: URL): { path: string } | null;
}

function urlPatternRoute(spec: { pathname: string }): Route {
	const pattern = new URLPattern(spec);
	return {
		test: (url) => pattern.test(url),
		exec: (url) => {
			const match = pattern.exec(url);
			return match ? { path: match.pathname.groups[0] ?? '' } : null;
		},
	};
}

function regexRoute(regex: RegExp): Route {
	return {
		test: (url) => regex.test(url.pathname),
		exec: (url) => {
			const match = regex.exec(url.pathname);
			return match ? { path: match[1] ?? '' } : null;
		},
	};
}

const HAS_URL_PATTERN = typeof URLPattern !== 'undefined';

const ROUTES = HAS_URL_PATTERN
	? {
			index: urlPatternRoute({ pathname: '/{index.html}?' }),
			editor: urlPatternRoute({ pathname: '/app/assets/e2e/omnipage/editor.html' }),
			source: urlPatternRoute({ pathname: '/__source/*' }),
			apiDetails: urlPatternRoute({ pathname: '/__api/details' }),
			apiMegafile: urlPatternRoute({ pathname: '/__api/megafile' }),
			apiFileInfo: urlPatternRoute({ pathname: '/__api/file/*' }),
			output: urlPatternRoute({ pathname: '/__output/*' }),
		}
	: {
			index: regexRoute(/^\/(?:index\.html)?$/),
			editor: regexRoute(/^\/app\/assets\/e2e\/omnipage\/editor\.html$/),
			source: regexRoute(/^\/__source\/(.*)$/),
			apiDetails: regexRoute(/^\/__api\/details$/),
			apiMegafile: regexRoute(/^\/__api\/megafile$/),
			apiFileInfo: regexRoute(/^\/__api\/file\/(.*)$/),
			output: regexRoute(/^\/__output\/(.*)$/),
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

function getOsUsername(): string | undefined {
	try {
		return userInfo().username?.trim();
	} catch {
		return undefined;
	}
}

function getContentType(filepath: string): string {
	const ext = extname(filepath).toLowerCase();
	return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
	// images
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.ico',
	'.webp',
	'.avif',
	'.bmp',
	'.tiff',
	'.tif',
	'.heic',
	'.heif',
	// fonts
	'.woff',
	'.woff2',
	'.ttf',
	'.otf',
	'.eot',
	// audio / video
	'.mp3',
	'.wav',
	'.ogg',
	'.flac',
	'.aac',
	'.m4a',
	'.mp4',
	'.webm',
	'.mov',
	'.avi',
	'.mkv',
	// archives / binaries
	'.zip',
	'.tar',
	'.gz',
	'.bz2',
	'.7z',
	'.rar',
	'.pdf',
	'.exe',
	'.dll',
	'.so',
	'.dylib',
	'.class',
	'.jar',
	'.wasm',
]);

function isBinaryBuffer(buf: Buffer): boolean {
	const sample = buf.length > 8000 ? buf.subarray(0, 8000) : buf;
	return sample.includes(0);
}

function isLikelyBinary(filepath: string): boolean {
	return BINARY_EXTENSIONS.has(extname(filepath).toLowerCase());
}

function titleizeDirname(dir: string): string {
	const name = basename(dir);
	const words = name
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.split(/[_\-\s]+/)
		.filter(Boolean);
	if (words.length === 0) {
		return name;
	}
	return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
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

async function getFileInfo(
	cwd: string,
	path: string
): Promise<{ content?: string; file_size: number; last_modified: string }> {
	const stats = await stat(join(cwd, path));

	let content: string | undefined;
	if (!isLikelyBinary(path)) {
		try {
			const buf = await readFile(join(cwd, path));
			if (!isBinaryBuffer(buf)) {
				content = buf.toString('utf8');
			}
		} catch {}
	}

	return { content, file_size: stats.size, last_modified: stats.mtime.toISOString() };
}

async function serveFileInfo(cwd: string, path: string): Promise<Response> {
	try {
		const payload = await getFileInfo(cwd, path);
		return new Response(JSON.stringify(payload), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (err: unknown) {
		if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
			return new Response('Not Found', { status: 404 });
		}
		return new Response('Internal Server Error', { status: 500 });
	}
}

async function serveMegafile(cwd: string, outputPath: string): Promise<Response> {
	const outputDir = outputPath.replace(/^\/+|\/+$/g, '');
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller): Promise<void> {
			try {
				const files = await getFileListing(cwd, outputPath);
				for (const file of files) {
					if (file === outputDir || file.startsWith(`${outputDir}/`)) {
						continue;
					}

					if (isLikelyBinary(file)) {
						continue;
					}

					try {
						const payload = await getFileInfo(cwd, file);
						controller.enqueue(encoder.encode(`${JSON.stringify({ filename: file, payload })}\n`));
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

const TEMPLATE_SUBSTITUTIONS: Readonly<Record<string, (port: number) => string>> = {
	'{{ DEV_SERVER_PORT }}': (port: number) => String(port),
	'{{ DEV_SERVER_ENTRYPOINT }}': () =>
		`${DEV_SERVER_ORIGIN}${DEV_SERVER_PREFIX}${DEV_SERVER_ENTRYPOINT}`,
	'{{ DEV_SERVER_SHARED_ENTRYPOINT }}': () =>
		`${DEV_SERVER_ORIGIN}${DEV_SERVER_PREFIX}${DEV_SERVER_SHARED_ENTRYPOINT}`,
	'{{ DEV_SERVER_STYLES_ENTRYPOINT }}': () =>
		`${DEV_SERVER_ORIGIN}${DEV_SERVER_PREFIX}${DEV_SERVER_STYLES_ENTRYPOINT}`,
};

async function serveTemplate(filename: string, port: number): Promise<Response> {
	try {
		let contents = await readFile(join(TEMPLATES_DIR, filename), 'utf-8');
		for (const [placeholder, resolve] of Object.entries(TEMPLATE_SUBSTITUTIONS)) {
			contents = contents.replaceAll(placeholder, resolve(port));
		}
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
		return await serveTemplate('index.html', port);
	}
	if (ROUTES.editor.test(url)) {
		return await serveTemplate('editor.html', port);
	}

	const sourceMatch = ROUTES.source.exec(url);
	if (sourceMatch) {
		const path = sourceMatch.path;
		return await serveFileContents(join(cwd, path));
	}

	if (ROUTES.apiDetails.test(url)) {
		try {
			const sourceFiles = await getFileListing(cwd, outputPath);
			const outputDir = outputPath.replace(/^\/+|\/+$/g, '');
			const siteName = titleizeDirname(cwd);
			const userName = getOsUsername();
			return new Response(JSON.stringify({ sourceFiles, outputDir, siteName, userName }), {
				headers: { 'Content-Type': 'application/json' },
			});
		} catch {
			return new Response('Internal Server Error', { status: 500 });
		}
	}

	if (ROUTES.apiMegafile.test(url)) {
		return await serveMegafile(cwd, outputPath);
	}

	const fileInfoMatch = ROUTES.apiFileInfo.exec(url);
	if (fileInfoMatch) {
		return await serveFileInfo(cwd, fileInfoMatch.path);
	}

	const outputMatch = ROUTES.output.exec(url);
	if (outputMatch) {
		const path = outputMatch.path;
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
