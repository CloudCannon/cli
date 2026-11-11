import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	checkFormat,
	checkMode,
	checkSsg,
	extensionFromFormat,
	listAllPages,
	stringify,
} from '../../src/configure/utility.ts';

describe('checkSsg', () => {
	it('returns the value for a valid SSG key', () => {
		assert.equal(checkSsg('astro'), 'astro');
		assert.equal(checkSsg('jekyll'), 'jekyll');
		assert.equal(checkSsg('hugo'), 'hugo');
	});

	it('returns undefined for an invalid string', () => {
		assert.equal(checkSsg('bananas'), undefined);
		assert.equal(checkSsg(''), undefined);
	});

	it('returns undefined for non-string values', () => {
		assert.equal(checkSsg(undefined), undefined);
		assert.equal(checkSsg(42), undefined);
		assert.equal(checkSsg(null), undefined);
	});
});

describe('checkMode', () => {
	it('returns hosted or headless', () => {
		assert.equal(checkMode('hosted'), 'hosted');
		assert.equal(checkMode('headless'), 'headless');
	});

	it('returns undefined for invalid values', () => {
		assert.equal(checkMode('other'), undefined);
		assert.equal(checkMode(''), undefined);
		assert.equal(checkMode(undefined), undefined);
	});
});

describe('checkFormat', () => {
	it('returns json or yaml', () => {
		assert.equal(checkFormat('json'), 'json');
		assert.equal(checkFormat('yaml'), 'yaml');
	});

	it('returns undefined for invalid values', () => {
		assert.equal(checkFormat('toml'), undefined);
		assert.equal(checkFormat(''), undefined);
		assert.equal(checkFormat(undefined), undefined);
	});
});

describe('extensionFromFormat', () => {
	it('returns extension for known format', () => {
		assert.equal(extensionFromFormat('json'), 'json');
		assert.equal(extensionFromFormat('yaml'), 'yml');
	});

	it('returns yml for undefined', () => {
		assert.equal(extensionFromFormat(undefined), 'yml');
	});
});

describe('stringify', () => {
	it('outputs valid JSON with trailing newline', () => {
		const result = stringify({ foo: 'bar' }, 'json');
		assert.equal(result, '{\n  "foo": "bar"\n}\n');
	});

	it('outputs valid YAML', () => {
		const result = stringify({ foo: 'bar' }, 'yaml');
		assert.equal(result, 'foo: bar\n');
	});
});

describe('listAllPages', () => {
	it('aggregates items across all pages', async () => {
		const pages = new Map<number, { items: string[]; total_pages?: number }>([
			[1, { items: ['a', 'b'], total_pages: 3 }],
			[2, { items: ['c'], total_pages: 3 }],
			[3, { items: ['d', 'e'], total_pages: 3 }],
		]);
		const requestedPages: number[] = [];

		const items = await listAllPages(async (page) => {
			requestedPages.push(page);
			return pages.get(page) ?? { items: [] };
		});

		assert.deepEqual(items, ['a', 'b', 'c', 'd', 'e']);
		assert.deepEqual(requestedPages, [1, 2, 3]);
	});

	it('stops after the first page when total_pages is missing', async () => {
		let calls = 0;

		const items = await listAllPages(async () => {
			calls++;
			return { items: ['a'] };
		});

		assert.deepEqual(items, ['a']);
		assert.equal(calls, 1);
	});

	it('returns an empty list for an empty first page', async () => {
		const items = await listAllPages(async () => ({ items: [] }));

		assert.deepEqual(items, []);
	});
});
