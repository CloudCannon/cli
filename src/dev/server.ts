import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, resolve as resolvePath } from 'node:path';
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

const CORS_HEADERS: Readonly<Record<string, string>> = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

const DEFAULT_INDEX_PLACEHOLDER = '{{ DEV_SERVER_ENTRYPOINT }}';

const TEMPLATES_DIR = fileURLToPath(new URL('./templates/', import.meta.url));

function getContentType(filepath: string): string {
	const ext = extname(filepath).toLowerCase();
	return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

async function serveFileContents(filepath: string): Promise<Response> {
	try {
		await stat(filepath);
		const stream = createReadStream(filepath);
		const webStream = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
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

async function serveTemplate(filename: string): Promise<Response> {
	try {
		const contents = await readFile(join(TEMPLATES_DIR, filename), 'utf-8');
		return new Response(contents, {
			headers: { 'Content-Type': 'text/html' },
		});
	} catch {
		return new Response('Internal Server Error', { status: 500 });
	}
}

async function serveIndexHtml(config: DevServerConfig): Promise<Response> {
	try {
		let contents = await readFile(join(TEMPLATES_DIR, 'index.html'), 'utf-8');
		const entrypointUrl = `${config.origin}${config.prefix}${config.entrypoint}`;
		contents = contents.replace(DEFAULT_INDEX_PLACEHOLDER, entrypointUrl);
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

	async function walk(currentPath: string, relativePath: string): Promise<void> {
		const entries = await readdir(currentPath, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(currentPath, entry.name);
			const relPath = relativePath ? join(relativePath, entry.name) : entry.name;
			if (matchesGitignore(relPath, patterns, entry.isDirectory(), outputPath)) continue;
			if (entry.isFile()) {
				files.push(relPath);
			} else if (entry.isDirectory()) {
				await walk(fullPath, relPath);
			}
		}
	}

	await walk(dir, '');
	return files;
}

function addCorsHeaders(response: Response): Response {
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(CORS_HEADERS)) {
		headers.set(key, value);
	}
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function createRoutes(): Routes {
	return {
		index: new URLPattern({ pathname: '/{index.html}?' }),
		editor: new URLPattern({ pathname: '/app/assets/e2e/omnipage/editor.html' }),
		source: new URLPattern({ pathname: '/__source/*' }),
		apiListing: new URLPattern({ pathname: '/__api/listing' }),
		apiOutputDir: new URLPattern({ pathname: '/__api/output_dir' }),
		output: new URLPattern({ pathname: '/__output/*' }),
	};
}

export interface DevServerOptions {
	outputPath: string;
	port?: number;
}

export interface DevServerConfig {
	outputPath: string;
	port: number;
	origin: string;
	prefix: string;
	entrypoint: string;
}

export interface Routes {
	index: URLPattern;
	editor: URLPattern;
	source: URLPattern;
	apiListing: URLPattern;
	apiOutputDir: URLPattern;
	output: URLPattern;
}

export function resolveConfig(options: DevServerOptions): DevServerConfig {
	const origin = process.env.DEV_SERVER_ORIGIN ?? 'https://cdn.cloudcannon.com';
	let prefix = process.env.DEV_SERVER_PREFIX;
	const entrypoint = process.env.DEV_SERVER_ENTRYPOINT ?? '/site-router-embed.js';

	if (!prefix && Boolean(process.env.USE_BETA_ASSETS)) {
		prefix = '/staging-dev-server';
	}
	if (!prefix) {
		prefix = '/production-dev-server';
	}

	return {
		outputPath: options.outputPath,
		port: options.port ?? 10101,
		origin,
		prefix,
		entrypoint,
	};
}

export interface DevServerHandle {
	port: number;
	url: string;
	close(): Promise<void>;
}

async function adaptRequest(req: IncomingMessage): Promise<Request> {
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
	config: DevServerConfig,
	cwd: string,
	routes: Routes
): Promise<Response> {
	if (routes.index.test(url)) {
		return await serveIndexHtml(config);
	}
	if (routes.editor.test(url)) {
		return await serveTemplate('editor.html');
	}

	const sourceMatch = routes.source.exec(url);
	if (sourceMatch) {
		const path = sourceMatch.pathname.groups[0] ?? '';
		return await serveFileContents(join(cwd, path));
	}

	if (routes.apiListing.test(url)) {
		try {
			const files = await getFileListing(cwd, config.outputPath);
			return new Response(JSON.stringify(files), {
				headers: { 'Content-Type': 'application/json' },
			});
		} catch {
			return new Response('Internal Server Error', { status: 500 });
		}
	}

	if (routes.apiOutputDir.test(url)) {
		const normalized = config.outputPath.replace(/^\/+|\/+$/g, '');
		return new Response(JSON.stringify(normalized), {
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const outputMatch = routes.output.exec(url);
	if (outputMatch) {
		const path = outputMatch.pathname.groups[0] ?? '';
		return await serveFileContents(join(cwd, config.outputPath, path));
	}

	return await serveFileContents(join(cwd, config.outputPath, url.pathname));
}

export async function startDevServer(options: DevServerOptions): Promise<DevServerHandle> {
	const config = resolveConfig(options);
	const cwd = process.cwd();
	const routes = createRoutes();

	const handler = async (request: Request): Promise<Response> => {
		const url = new URL(request.url);
		const start = performance.now();

		if (request.method === 'OPTIONS') {
			const response = new Response(null, { status: 204, headers: CORS_HEADERS });
			const duration = (performance.now() - start).toFixed(2);
			console.log(`${request.method} ${url.pathname} ${response.status} ${duration}ms`);
			return response;
		}

		const response = addCorsHeaders(await handleRoute(url, config, cwd, routes));
		const duration = (performance.now() - start).toFixed(2);
		console.log(`${request.method} ${url.pathname} ${response.status} ${duration}ms`);
		return response;
	};

	const server = createServer(async (req, res) => {
		try {
			const request = await adaptRequest(req);
			const response = await handler(request);
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
		server.listen(config.port, () => {
			server.off('error', reject);
			resolve();
		});
	});

	const addr = server.address();
	const actualPort = typeof addr === 'object' && addr ? addr.port : config.port;
	const url = `http://localhost:${actualPort}`;

	console.log(`CloudCannon dev server running at ${url}`);
	console.log(`Serving output from: ${resolvePath(cwd, config.outputPath)}`);
	console.log(`Entrypoint: ${config.origin}${config.prefix}${config.entrypoint}`);

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
