import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { type SsgKey, ssgs } from '@cloudcannon/gadget';
import { em, type Format, type Mode, printHelp, warning } from '../utility.ts';
import {
	cmdBuild,
	cmdCollections,
	cmdDetectSource,
	cmdGenerateAuto,
	cmdGenerateInteractive,
} from './configuration-file.ts';
import { cmdInitSettings } from './initial-site-settings.ts';
import { cmdDetectSsg } from './ssg.ts';

const checkString = (value: string | unknown): string | undefined => {
	return typeof value === 'string' ? value : undefined;
};

const checkBoolean = (value: boolean | unknown): boolean => {
	return value === true || value === false ? value : false;
};

const checks = {
	ssg: (value: string | unknown): SsgKey | undefined => {
		return typeof value === 'string' && Object.hasOwn(ssgs, value) ? (value as SsgKey) : undefined;
	},
	mode: (value: string | unknown): Mode | undefined => {
		return value === 'hosted' || value === 'headless' ? value : undefined;
	},
	source: checkString,
	output: checkString,
	'build-command': checkString,
	'install-command': checkString,
	'output-path': checkString,
	'init-settings': checkBoolean,
	auto: checkBoolean,
	json: checkBoolean,
	format: (value: string | unknown): Format | undefined => {
		return value === 'yaml' || value === 'json' ? value : undefined;
	},
} as const;

export async function run(args: string[]): Promise<void> {
	const { tokens, values } = parseArgs({
		args,
		tokens: true,
		options: {
			help: { type: 'boolean', short: 'h', default: false },
		},
		allowPositionals: true,
		strict: false,
	});

	const subcommandToken = tokens.find((token) => token.kind === 'positional');
	const help = values.help;
	const helpArgs = {
		description: 'Generate CloudCannon configuration files.',
		command: 'configure',
		subcommand: '<command>',
		arg: '[path]',
		flags: [{ value: '-h, --help', description: 'Show help for command' }],
		args: [{ value: '[path]', description: 'The path to your site files (default: .)' }],
	};

	if (subcommandToken) {
		const subcommand = subcommandToken.value;
		const remainingArgs = args.slice(subcommandToken.index + 1);

		switch (subcommand) {
			case 'detect-ssg': {
				if (help) {
					return printHelp({
						...helpArgs,
						description: 'Detect the static site generator.',
						subcommand: 'detect-ssg',
					});
				}

				const { positionals } = parseArgs({
					args: remainingArgs,
					allowPositionals: true,
					strict: false,
				});

				const targetPath = resolve(positionals[0] ?? '.');

				return await cmdDetectSsg(targetPath);
			}
			case 'detect-source': {
				if (help) {
					return printHelp({
						...helpArgs,
						description: 'Detect the source folder.',
						subcommand: 'detect-source',
						flags: [
							{ value: '--ssg <name>', description: 'Override SSG detection' },
							...helpArgs.flags,
						],
					});
				}

				const { positionals, values } = parseArgs({
					args: remainingArgs,
					options: {
						ssg: { type: 'string' },
					},
					allowPositionals: true,
					strict: false,
				});

				const targetPath = resolve(positionals[0] ?? '.');
				const ssg = checks.ssg(values.ssg);

				return await cmdDetectSource(targetPath, { ssg });
			}
			case 'collections': {
				if (help) {
					return printHelp({
						...helpArgs,
						description: 'List detected collections.',
						subcommand: 'collections',
						flags: [
							{ value: '--source <path>', description: 'Override source folder' },
							{ value: '--ssg <name>', description: 'Override SSG detection' },
							...helpArgs.flags,
						],
					});
				}

				const { positionals, values } = parseArgs({
					args: remainingArgs,
					options: {
						source: { type: 'string' },
						ssg: { type: 'string' },
					},
					allowPositionals: true,
					strict: false,
				});

				const targetPath = resolve(positionals[0] ?? '.');
				const source = checks.source(values.source);
				const ssg = checks.ssg(values.ssg);

				return await cmdCollections(targetPath, { source, ssg });
			}
			case 'build': {
				if (help) {
					return printHelp({
						...helpArgs,
						description: 'Show build command suggestions.',
						subcommand: 'build',
						flags: [
							{ value: '--source <path>', description: 'Override source folder' },
							{ value: '--ssg <name>', description: 'Override SSG detection' },
							...helpArgs.flags,
						],
					});
				}

				const { positionals, values } = parseArgs({
					args: remainingArgs,
					options: {
						source: { type: 'string' },
						ssg: { type: 'string' },
					},
					allowPositionals: true,
					strict: false,
				});

				const targetPath = resolve(positionals[0] ?? '.');
				const source = checks.source(values.source);
				const ssg = checks.ssg(values.ssg);

				return await cmdBuild(targetPath, { source, ssg });
			}
			case 'init-settings': {
				if (help) {
					return printHelp({
						...helpArgs,
						description: `Generate ${em('.cloudcannon/initial-site-settings.json')} file.`,
						subcommand: 'init-settings',
						flags: [
							{ value: '--source <path>', description: 'Override source folder' },
							{ value: '--ssg <name>', description: 'Override SSG detection' },
							{
								value: '--mode <hosted|headless>',
								description: 'Mode for initial-site-settings (default: hosted)',
							},
							{ value: '--install-command <cmd>', description: 'Override install command' },
							{ value: '--build-command <cmd>', description: 'Override build command' },
							{ value: '--output-path <path>', description: 'Override output path' },
							...helpArgs.flags,
						],
					});
				}

				const { positionals, values } = parseArgs({
					args: remainingArgs,
					options: {
						source: { type: 'string' },
						ssg: { type: 'string' },
						mode: { type: 'string' },
						'install-command': { type: 'string' },
						'build-command': { type: 'string' },
						'output-path': { type: 'string' },
					},
					allowPositionals: true,
					strict: false,
				});

				const targetPath = resolve(positionals[0] ?? '.');
				const source = checks.source(values.source);
				const ssg = checks.ssg(values.ssg);
				const mode = checks.mode(values.mode);
				const buildCommand = checks['build-command'](values['build-command']);
				const installCommand = checks['install-command'](values['install-command']);
				const outputPath = checks['output-path'](values['output-path']);

				return await cmdInitSettings(targetPath, {
					mode,
					source,
					ssg,
					'build-command': buildCommand,
					'install-command': installCommand,
					'output-path': outputPath,
				});
			}
			case 'generate': {
				if (help) {
					return printHelp({
						...helpArgs,
						description: `Generate ${em('cloudcannon.config.(yaml|json)')} file.`,
						subcommand: 'generate',
						flags: [
							{ value: '--auto', description: 'Non-interactive mode, accept all suggestions' },
							{ value: '--json', description: 'Output raw JSON to stdout' },
							{ value: '--source <path>', description: 'Override source folder' },
							{ value: '--ssg <name>', description: 'Override SSG detection' },
							{
								value: '--mode <hosted|headless>',
								description: 'Mode for initial-site-settings (default: hosted)',
							},
							{ value: '--format <yaml|json>', description: 'Output format (default: yaml)' },
							{ value: '--output <path>', description: 'Output file path' },
							{
								value: '--init-settings',
								description: `Also generate ${em('initial-site-settings.json')} file`,
							},
							...helpArgs.flags,
						],
					});
				}

				const { positionals, values } = parseArgs({
					args: remainingArgs,
					options: {
						auto: { type: 'boolean', default: false },
						json: { type: 'boolean', default: false },
						source: { type: 'string' },
						ssg: { type: 'string' },
						mode: { type: 'string' },
						format: { type: 'string' },
						output: { type: 'string' },
						'init-settings': { type: 'boolean', default: false },
					},
					allowPositionals: true,
					strict: false,
				});

				const targetPath = resolve(positionals[0] ?? '.');
				const source = checks.source(values.source);
				const ssg = checks.ssg(values.ssg);
				const mode = checks.mode(values.mode);
				const auto = checks.auto(values.auto);
				const json = checks.json(values.json);
				const output = checks.output(values.output);
				const format = checks.format(values.format);
				const initSettings = checks['init-settings'](values['init-settings']);

				if (auto || json) {
					return await cmdGenerateAuto(targetPath, {
						ssg,
						source,
						json,
						format,
						output,
						mode,
						'init-settings': initSettings,
					});
				}

				return await cmdGenerateInteractive(targetPath, { format, output });
			}
			default:
				console.error(`${warning('Unknown configure subcommand:')} ${subcommand}`);
				process.exit(1);
		}
	}

	if (help) {
		return printHelp({
			...helpArgs,
			commands: [
				{ value: 'build', description: 'Show build command suggestions' },
				{ value: 'collections', description: 'List detected collections' },
				{ value: 'detect-source', description: 'Detect the source folder' },
				{ value: 'detect-ssg', description: 'Detect the static site generator' },
				{ value: 'generate', description: `Generate ${em('cloudcannon.config.(yaml|json)')} file` },
				{
					value: 'init-settings',
					description: `Generate ${em('.cloudcannon/initial-site-settings.json')} file`,
				},
			],
		});
	}
}
