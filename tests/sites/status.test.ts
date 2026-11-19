import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	compileTemplate,
	formatCsv,
	formatLines,
	formatRows,
	formatTable,
	resolveFormat,
	type SiteStatusRow,
} from '../../src/sites/status.ts';

const sampleRows: SiteStatusRow[] = [
	{
		site_name: 'Eagle Advance',
		uuid: 'aaa',
		id: 1,
		branch: 'production',
		status: 'Built',
	},
	{
		site_name: 'Eagle Advance',
		uuid: 'bbb',
		id: 2,
		branch: 'dev',
		status: 'No New Build',
	},
	{
		site_name: 'Today Cash',
		uuid: 'ccc',
		id: 3,
		branch: null,
		status: 'Failed',
	},
];

describe('resolveFormat', () => {
	it('defaults to json when omitted', () => {
		assert.deepEqual(resolveFormat(undefined), { kind: 'json' });
	});

	it('resolves known presets', () => {
		assert.deepEqual(resolveFormat('lines'), { kind: 'preset', name: 'lines' });
		assert.deepEqual(resolveFormat('table'), { kind: 'preset', name: 'table' });
		assert.deepEqual(resolveFormat('csv'), { kind: 'preset', name: 'csv' });
	});

	it('compiles custom templates', () => {
		const resolved = resolveFormat('{site_name}: {status}');
		assert.equal(resolved.kind, 'template');
		if (resolved.kind === 'template') {
			assert.equal(resolved.render(sampleRows[0]), 'Eagle Advance: Built');
		}
	});
});

describe('compileTemplate', () => {
	it('substitutes known fields and empty branch', () => {
		const render = compileTemplate('{site_name}|{branch}|{id}|{uuid}|{status}');
		assert.equal(render(sampleRows[2]), 'Today Cash||3|ccc|Failed');
	});

	it('escapes literal braces', () => {
		const render = compileTemplate('{{site_name}}: {site_name}');
		assert.equal(render(sampleRows[0]), '{site_name}: Eagle Advance');
	});

	it('rejects unknown placeholders', () => {
		assert.throws(() => compileTemplate('{nope}'), /Unknown --format placeholder/);
	});

	it('rejects unclosed placeholders', () => {
		assert.throws(() => compileTemplate('{site_name'), /Unclosed placeholder/);
	});
});

describe('format presets', () => {
	it('formats lines with branch disambiguation for duplicate names', () => {
		assert.deepEqual(formatLines(sampleRows), [
			'Eagle Advance (production): Built',
			'Eagle Advance (dev): No New Build',
			'Today Cash: Failed',
		]);
	});

	it('formats an aligned table', () => {
		const lines = formatTable(sampleRows);
		assert.equal(lines[0], 'SITE_NAME      BRANCH      STATUS      ');
		assert.equal(lines[1], 'Eagle Advance  production  Built       ');
		assert.equal(lines[2], 'Eagle Advance  dev         No New Build');
		assert.equal(lines[3], 'Today Cash                 Failed      ');
	});

	it('formats csv with a header row and quoting', () => {
		const quoted: SiteStatusRow = {
			site_name: 'Cash, "Ltd"',
			uuid: 'ddd',
			id: 4,
			branch: 'main',
			status: 'Building',
		};
		assert.deepEqual(formatCsv([quoted]), [
			'site_name,uuid,id,branch,status',
			'"Cash, ""Ltd""",ddd,4,main,Building',
		]);
	});

	it('formatRows returns null for json and lines for presets', () => {
		assert.equal(formatRows(sampleRows, { kind: 'json' }), null);
		assert.deepEqual(formatRows(sampleRows, { kind: 'preset', name: 'lines' }), formatLines(sampleRows));
	});
});
