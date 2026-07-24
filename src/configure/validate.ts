import { relative, resolve } from 'node:path';
import { type CommandContext, defineCommand } from 'citty';
import { pathArg, text } from './utility.ts';
import { validateEditorLinks } from './validate-editor-links.ts';
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
	validateConfig,
	validateRouting,
	validateSettings,
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
	'editor-links': {
		type: 'boolean',
		default: false,
		description: 'Validate only the CloudCannon editor links in the config and README',
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

		if (ctx.args['editor-links'] && ctx.args.stdin) {
			console.error(
				`${text.em('--editor-links')} cannot be combined with ${text.em('--stdin')} — it needs the README and files on disk.`
			);
			process.exit(1);
		}

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

			const validator = ctx.args.configuration
				? validateConfig
				: ctx.args['initial-site-settings']
					? validateSettings
					: validateRouting;

			const parsed = await readAndParseStdin();
			if (!parsed || !checkParsed('<stdin>', validator, parsed)) {
				process.exit(1);
			}

			return;
		}

		const none =
			!ctx.args.configuration &&
			!ctx.args['initial-site-settings'] &&
			!ctx.args.routing &&
			!ctx.args['editor-links'];
		const doConfig = ctx.args.configuration || none;
		const doSettings = ctx.args['initial-site-settings'] || none;
		const doRouting = ctx.args.routing || none;
		const doLinks = ctx.args['editor-links'] || none;

		let allValid = true;

		let configPath: string | undefined;
		if (doConfig || doLinks) {
			configPath = await findConfigFile(targetPath, ctx.args['configuration-path']);

			if (!configPath) {
				const searched = ctx.args['configuration-path'] ?? CONFIG_FILENAMES.map(text.em).join(', ');
				console.error(`No CloudCannon configuration file found. Searched: ${searched}`);
				process.exit(1);
			}
		}

		if (doConfig && configPath) {
			const configDisplayName = relative(targetPath, configPath);
			const parsedConfig = await readAndParseFile(configPath, configDisplayName);
			if (!parsedConfig) {
				process.exit(1);
			}

			allValid = checkParsed(configDisplayName, validateConfig, parsedConfig) && allValid;

			const splitConfigFiles = await findSplitConfigFiles(configPath, parsedConfig, targetPath);
			for (let i = 0; i < splitConfigFiles.length; i++) {
				allValid =
					(await checkFile(
						splitConfigFiles[i].filePath,
						splitConfigFiles[i].validate,
						targetPath
					)) && allValid;
			}
		}

		if (doSettings) {
			const settingsPath = resolve(targetPath, SETTINGS_PATH);
			allValid = (await checkFile(settingsPath, validateSettings, targetPath, none)) && allValid;
		}

		if (doRouting) {
			const routingPath = resolve(targetPath, ROUTING_PATH);
			allValid = (await checkFile(routingPath, validateRouting, targetPath, none)) && allValid;
		}

		if (doLinks && configPath) {
			allValid = (await validateEditorLinks(targetPath, configPath)) && allValid;
		}

		if (!allValid) {
			process.exit(1);
		}
	},
});
