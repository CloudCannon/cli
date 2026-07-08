import type { IncomingMessage, ServerResponse } from 'node:http';

export function readRequestBody(req: IncomingMessage): Promise<Buffer> {
	return new Promise<Buffer>((resolve) => {
		let body = Buffer.alloc(0);
		req.on('data', (chunk) => {
			body = Buffer.concat([body, chunk]);
		});
		req.on('end', () => {
			resolve(body);
		});
	});
}

export async function readRequestBodyToJSON(req: IncomingMessage): Promise<unknown> {
	const buffer = await readRequestBody(req);
	return JSON.parse(buffer.toString());
}

export function getRequestURL(req: IncomingMessage): URL {
	const host = req.headers.host ?? 'localhost';
	return new URL(req.url ?? '/', `http://${host}`);
}

export async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
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
