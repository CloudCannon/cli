import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { resolveConfig, startDevServer } from '../../src/dev/server.ts';

const ENV_VARS = [
	'DEV_SERVER_ORIGIN',
	'DEV_SERVER_PREFIX',
	'DEV_SERVER_ENTRYPOINT',
	'USE_BETA_ASSETS',
] as const;

const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
	for (const name of ENV_VARS) {
		originalEnv[name] ??= process.env[name];
		delete process.env[name];
	}
});

afterEach(() => {
	for (const name of ENV_VARS) {
		const value = originalEnv[name];
		if (value === undefined) {
			delete process.env[name];
		} else {
			process.env[name] = value;
		}
	}
});

describe('resolveConfig', () => {
	it('returns defaults when no options or env vars are set', () => {
		const config = resolveConfig({ outputPath: '_site' });
		assert.equal(config.origin, 'https://cdn.cloudcannon.com');
		assert.equal(config.prefix, '/production-dev-server');
		assert.equal(config.entrypoint, '/site-router-embed.js');
		assert.equal(config.port, 10101);
		assert.equal(config.outputPath, '_site');
	});

	it('uses a custom port when provided', () => {
		const config = resolveConfig({ outputPath: '_site', port: 9999 });
		assert.equal(config.port, 9999);
	});

	it('reads origin, prefix, and entrypoint from env vars', () => {
		process.env.DEV_SERVER_ORIGIN = 'https://env.example.com';
		process.env.DEV_SERVER_PREFIX = '/env-prefix';
		process.env.DEV_SERVER_ENTRYPOINT = '/env-entry.js';
		const config = resolveConfig({ outputPath: '_site' });
		assert.equal(config.origin, 'https://env.example.com');
		assert.equal(config.prefix, '/env-prefix');
		assert.equal(config.entrypoint, '/env-entry.js');
	});

	it('uses the staging prefix when USE_BETA_ASSETS env var is set', () => {
		process.env.USE_BETA_ASSETS = '1';
		const config = resolveConfig({ outputPath: '_site' });
		assert.equal(config.prefix, '/staging-dev-server');
	});

	it('prefers an explicit DEV_SERVER_PREFIX over beta assets', () => {
		process.env.USE_BETA_ASSETS = '1';
		process.env.DEV_SERVER_PREFIX = '/my-prefix';
		const config = resolveConfig({ outputPath: '_site' });
		assert.equal(config.prefix, '/my-prefix');
	});
});

describe('startDevServer (integration)', () => {
	it('serves the index page with the configured entrypoint injected', async () => {
		const cwd = await mkdtemp(join(tmpdir(), 'cc-dev-test-'));
		const outputPath = '_site';
		await mkdir(join(cwd, outputPath), { recursive: true });
		await writeFile(join(cwd, outputPath, 'index.html'), '<!doctype html>', 'utf-8');

		process.env.DEV_SERVER_ORIGIN = 'https://cdn.example.com';
		process.env.DEV_SERVER_PREFIX = '/dev-server';
		process.env.DEV_SERVER_ENTRYPOINT = '/router.js';

		const originalCwd = process.cwd();
		process.chdir(cwd);
		try {
			const handle = await startDevServer({ outputPath, port: 0 });
			try {
				const res = await fetch(`${handle.url}/`);
				assert.equal(res.status, 200);
				const body = await res.text();
				assert.match(body, /https:\/\/cdn\.example\.com\/dev-server\/router\.js/);
			} finally {
				await handle.close();
			}
		} finally {
			process.chdir(originalCwd);
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it('returns 404 for missing files in the output directory', async () => {
		const cwd = await mkdtemp(join(tmpdir(), 'cc-dev-test-'));
		const outputPath = '_site';
		await mkdir(join(cwd, outputPath), { recursive: true });
		await writeFile(join(cwd, outputPath, 'index.html'), '<!doctype html>', 'utf-8');

		const originalCwd = process.cwd();
		process.chdir(cwd);
		try {
			const handle = await startDevServer({ outputPath, port: 0 });
			try {
				const res = await fetch(`${handle.url}/does-not-exist.html`);
				assert.equal(res.status, 404);
			} finally {
				await handle.close();
			}
		} finally {
			process.chdir(originalCwd);
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it('reports the configured output dir via __api/output_dir', async () => {
		const cwd = await mkdtemp(join(tmpdir(), 'cc-dev-test-'));
		const originalCwd = process.cwd();
		process.chdir(cwd);
		try {
			const handle = await startDevServer({ outputPath: 'public', port: 0 });
			try {
				const res = await fetch(`${handle.url}/__api/output_dir`);
				assert.equal(res.status, 200);
				const text = await res.text();
				assert.equal(text, JSON.stringify('public'));
			} finally {
				await handle.close();
			}
		} finally {
			process.chdir(originalCwd);
			await rm(cwd, { recursive: true, force: true });
		}
	});
});
