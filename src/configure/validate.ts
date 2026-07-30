import { relative, resolve } from 'node:path';
import { type CommandContext, defineCommand } from 'citty';
import { pathArg, text } from './utility.ts';
import {
	CONFIG_FILENAMES,
	checkFile,
	checkParsed,
	findConfigFile,
	findSplitConfigFiles,
	ROUTING_PATH,
	readAndParseFile,
	readAndParseStdin,
	SETTINGS_PATH,
} from './validator.ts';

const args = {
	...pathArg,
	configuration: {
		type: 'boolean',
		default: false,
		description:
			'Validate only the CloudCannon configuration file and any split configuration files',
	},
	'initial-site-settings': {
		type: 'boolean',
		default: false,
		description: `Validate only ${text.em(SETTINGS_PATH)}`,
	},
	routing: {
		type: 'boolean',
		default: false,
		description: `Validate only ${text.em(ROUTING_PATH)}`,
	},
	'configuration-path': {
		type: 'string',
		description: `Path to the CloudCannon configuration file, overrides ${text.em('PATH')} search`,
		valueHint: 'path',
	},
	stdin: {
		type: 'boolean',
		default: false,
		description: 'Read from stdin instead of files on disk',
	},
} as const;

export const validateCommand = defineCommand({
	meta: {
		name: 'validate',
		description: 'Validate CloudCannon configuration files.',
	},
	args,
	async run(ctx: CommandContext<typeof args>): Promise<void> {
		const targetPath = resolve(ctx.args.path ?? '.');

		if (ctx.args.stdin) {
			const explicit = [
				ctx.args.configuration,
				ctx.args['initial-site-settings'],
				ctx.args.routing,
			];
			if (explicit.filter(Boolean).length !== 1) {
				console.error(
					`Exactly one of ${text.em('--configuration')}, ${text.em('--initial-site-settings')}, or ${text.em('--routing')} must be set when reading from stdin.`
				);
				process.exit(1);
			}

			const name = ctx.args.configuration
				? 'global'
				: ctx.args['initial-site-settings']
					? 'settings'
					: 'routing';

			const parsed = await readAndParseStdin();
			if (!parsed || !(await checkParsed('<stdin>', name, parsed))) {
				process.exit(1);
			}

			return;
		}

		const none = !ctx.args.configuration && !ctx.args['initial-site-settings'] && !ctx.args.routing;
		const doConfig = ctx.args.configuration || none;
		const doSettings = ctx.args['initial-site-settings'] || none;
		const doRouting = ctx.args.routing || none;

		let allValid = true;

		if (doConfig) {
			const configPath = await findConfigFile(targetPath, ctx.args['configuration-path']);

			if (!configPath) {
				const searched = ctx.args['configuration-path'] ?? CONFIG_FILENAMES.map(text.em).join(', ');
				console.error(`No CloudCannon configuration file found. Searched: ${searched}`);
				process.exit(1);
			}

			const configDisplayName = relative(targetPath, configPath);
			const parsedConfig = await readAndParseFile(configPath, configDisplayName);
			if (!parsedConfig) {
				process.exit(1);
			}

			allValid = (await checkParsed(configDisplayName, 'global', parsedConfig)) && allValid;

			const splitConfigFiles = await findSplitConfigFiles(configPath, parsedConfig, targetPath);
			for (let i = 0; i < splitConfigFiles.length; i++) {
				allValid =
					(await checkFile(splitConfigFiles[i].filePath, splitConfigFiles[i].name, targetPath)) &&
					allValid;
			}
		}

		if (doSettings) {
			const settingsPath = resolve(targetPath, SETTINGS_PATH);
			allValid = (await checkFile(settingsPath, 'settings', targetPath, none)) && allValid;
		}

		if (doRouting) {
			const routingPath = resolve(targetPath, ROUTING_PATH);
			allValid = (await checkFile(routingPath, 'routing', targetPath, none)) && allValid;
		}

		if (!allValid) {
			process.exit(1);
		}
	},
});
