import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	parseEnvironmentVariables,
	upsertEnvironmentVariable,
} from '../../src/sites/build-config.ts';

describe('upsertEnvironmentVariable', () => {
	it('adds a new environment variable when the key does not exist', () => {
		const result = upsertEnvironmentVariable([{ key: 'EXISTING', value: 'one' }], 'NEW_VAR', 'two');

		assert.deepEqual(result, [
			{ key: 'EXISTING', value: 'one' },
			{ key: 'NEW_VAR', value: 'two' },
		]);
	});

	it('updates an existing environment variable with the same key', () => {
		const result = upsertEnvironmentVariable(
			[
				{ key: 'FOO', value: 'old' },
				{ key: 'BAR', value: 'keep' },
			],
			'FOO',
			'new'
		);

		assert.deepEqual(result, [
			{ key: 'FOO', value: 'new' },
			{ key: 'BAR', value: 'keep' },
		]);
	});

	it('adds to an empty list', () => {
		const result = upsertEnvironmentVariable([], 'ONLY', 'value');
		assert.deepEqual(result, [{ key: 'ONLY', value: 'value' }]);
	});

	it('allows an empty string value', () => {
		const result = upsertEnvironmentVariable([{ key: 'EMPTY', value: 'x' }], 'EMPTY', '');
		assert.deepEqual(result, [{ key: 'EMPTY', value: '' }]);
	});

	it('does not mutate the input array', () => {
		const existing = [{ key: 'A', value: '1' }];
		const result = upsertEnvironmentVariable(existing, 'A', '2');

		assert.deepEqual(existing, [{ key: 'A', value: '1' }]);
		assert.deepEqual(result, [{ key: 'A', value: '2' }]);
		assert.notEqual(result[0], existing[0]);
	});
});

describe('parseEnvironmentVariables', () => {
	it('returns an empty array for nullish input', () => {
		assert.deepEqual(parseEnvironmentVariables(undefined), []);
		assert.deepEqual(parseEnvironmentVariables(null), []);
	});

	it('parses environment variables from an object', () => {
		const result = parseEnvironmentVariables({
			compile: {
				environment_variables: [
					{ key: 'NODE_ENV', value: 'production' },
					{ key: 'API_URL', value: 'https://example.com' },
				],
			},
		});

		assert.deepEqual(result, [
			{ key: 'NODE_ENV', value: 'production' },
			{ key: 'API_URL', value: 'https://example.com' },
		]);
	});

	it('parses environment variables from a JSON string', () => {
		const result = parseEnvironmentVariables(
			JSON.stringify({
				compile: {
					environment_variables: [{ key: 'HUGO_ENV', value: 'production' }],
				},
			})
		);

		assert.deepEqual(result, [{ key: 'HUGO_ENV', value: 'production' }]);
	});

	it('returns an empty array for invalid JSON', () => {
		assert.deepEqual(parseEnvironmentVariables('{not json'), []);
	});

	it('returns an empty array when compile or environment_variables is missing', () => {
		assert.deepEqual(parseEnvironmentVariables({}), []);
		assert.deepEqual(parseEnvironmentVariables({ compile: {} }), []);
		assert.deepEqual(parseEnvironmentVariables({ compile: { environment_variables: null } }), []);
	});

	it('filters out malformed environment variable entries', () => {
		const result = parseEnvironmentVariables({
			compile: {
				environment_variables: [
					{ key: 'GOOD', value: 'yes' },
					{ key: 'MISSING_VALUE' },
					{ value: 'missing_key' },
					'not-an-object',
					null,
					{ key: 1, value: 'bad-key-type' },
				],
			},
		});

		assert.deepEqual(result, [{ key: 'GOOD', value: 'yes' }]);
	});
});
