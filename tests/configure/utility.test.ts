import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	checkFormat,
	checkMode,
	checkSsg,
	extensionFromFormat,
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
