import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defineCommand } from 'citty';
import { documentCommand } from '../scripts/command-documentation.ts';

// Force color on before the command modules load, matching how documentation
// is generated, so styled parts of descriptions become markdown code spans.
process.env.FORCE_COLOR = '3';
const { main }: typeof import('../src/main.ts') = await import('../src/main.ts');

describe('documentCommand', () => {
	it('documents the root command', async () => {
		const docs = await documentCommand(main);

		assert.equal(docs.name, 'cloudcannon');
		assert.equal(docs.fullName, 'cloudcannon');
		assert.equal(docs.description, 'Work with CloudCannon from the command line.');
		assert.ok(docs.version);
		assert.ok(docs.subCommands && docs.subCommands.length > 0);
	});

	it('documents nested commands with full names', async () => {
		const docs = await documentCommand(main);

		const sites = docs.subCommands?.find((command) => command.name === 'sites');
		assert.ok(sites);
		assert.equal(sites.fullName, 'cloudcannon sites');

		const get = sites.subCommands?.find((command) => command.name === 'get');
		assert.ok(get);
		assert.equal(get.fullName, 'cloudcannon sites get');

		const siteArg = get.options?.find((arg) => arg.name === 'site');
		assert.ok(siteArg);
		assert.equal(siteArg.type, 'string');
		assert.equal(siteArg.required, true);
		assert.equal(siteArg.valueHint, 'name|id|uuid|domain');
	});

	it('preserves defaults and negative descriptions', async () => {
		const docs = await documentCommand(main);

		const dev = docs.subCommands?.find((command) => command.name === 'dev');
		assert.ok(dev);

		const port = dev.options?.find((arg) => arg.name === 'port');
		assert.ok(port);
		assert.equal(port.default, '10101');
		assert.equal(port.required, false);

		const liveSync = dev.options?.find((arg) => arg.name === 'live-sync');
		assert.ok(liveSync);
		assert.equal(liveSync.type, 'boolean');
		assert.equal(liveSync.default, true);

		const noLiveSync = dev.options?.find((arg) => arg.name === 'no-live-sync');
		assert.ok(noLiveSync);
		assert.equal(noLiveSync.type, 'boolean');
		assert.ok(noLiveSync.description);

		const outputPath = dev.args?.find((arg) => arg.name === 'outputPath');
		assert.ok(outputPath);
		assert.equal(outputPath.type, 'positional');
		assert.equal(outputPath.required, true);
	});

	it('renders usage as a short single line', async () => {
		const docs = await documentCommand(main);

		const sites = docs.subCommands?.find((command) => command.name === 'sites');
		const get = sites?.subCommands?.find((command) => command.name === 'get');
		assert.ok(get);
		assert.ok(get.usage.startsWith('cloudcannon sites get'));
		assert.ok(!get.usage.includes('\n'));
		assert.ok(!get.usage.includes('\u001B['));
	});

	it('preserves markdown code spans in descriptions', async () => {
		const docs = await documentCommand(main);

		const validate = docs.subCommands?.find((command) => command.name === 'validate');
		const routing = validate?.options?.find((arg) => arg.name === 'routing');
		assert.ok(routing);
		assert.equal(routing.description, 'Validate only `.cloudcannon/routing.json`');
	});

	it('documents enum options, aliases, and skips hidden commands', async () => {
		const command = defineCommand({
			meta: {
				name: 'example',
				description: 'An example command.',
			},
			args: {
				format: {
					type: 'enum',
					description: 'Output format',
					options: ['json', 'yaml'],
					default: 'yaml',
				},
				force: {
					type: 'boolean',
					description: 'Skip confirmation',
					alias: 'f',
				},
			},
			subCommands: {
				visible: defineCommand({
					meta: { name: 'visible', description: 'A visible command.' },
				}),
				secret: defineCommand({
					meta: { name: 'secret', description: 'A hidden command.', hidden: true },
				}),
			},
		});

		const docs = await documentCommand(command);

		const format = docs.options?.find((arg) => arg.name === 'format');
		assert.ok(format);
		assert.equal(format.type, 'enum');
		assert.deepEqual(format.options, ['json', 'yaml']);
		assert.equal(format.default, 'yaml');
		assert.equal(format.required, false);

		const force = docs.options?.find((arg) => arg.name === 'force');
		assert.ok(force);
		assert.deepEqual(force.alias, ['f']);

		assert.deepEqual(
			docs.subCommands?.map((sub) => sub.name),
			['visible']
		);
	});
});
