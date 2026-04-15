import { basename, resolve } from 'node:path';
import * as p from '@clack/prompts';
import type {
	CollectionConfig,
	InitialSiteSettings,
	SsgKey,
} from '@cloudcannon/configuration-types';
import type { BuildCommands } from '@cloudcannon/gadget';
import {
	type CollectionConfigTree,
	generateBuildCommands,
	generateConfiguration,
	ssgs,
} from '@cloudcannon/gadget';
import type { BuildCommandSuggestion } from '@cloudcannon/gadget/dist/ssgs/ssg.js';
import { type CommandContext, defineCommand } from 'citty';
import {
	detectSsg,
	em,
	flattenCollectionTree,
	getFilePaths,
	readFileFn,
	secondary,
	stringify,
	success,
	writeFileAndFolder,
} from '../utility.ts';
import {
	checkFormat,
	checkMode,
	checkSsg,
	DEFAULT_FORMAT,
	DEFAULT_MODE,
	extensionFromFormat,
	type Format,
	type Mode,
	modeArg,
	pathArg,
	sourceArg,
	ssgArg,
} from './args.ts';

export function generateInitialSiteSettings(
	ssg: SsgKey,
	buildCommands: BuildCommands,
	options?: {
		mode?: Mode;
		overrides?: {
			install?: string;
			build?: string;
			output?: string;
		};
	}
): InitialSiteSettings {
	const envVars = Object.entries(buildCommands.environment).map(([key, suggestion]) => ({
		key,
		value: suggestion.value,
	}));

	if (options?.overrides?.install) {
		buildCommands.install = [{ value: options?.overrides.install, attribution: 'override' }];
	}

	if (options?.overrides?.build) {
		buildCommands.build = [{ value: options?.overrides.build, attribution: 'override' }];
	}

	if (options?.overrides?.output) {
		buildCommands.output = [{ value: options?.overrides.output, attribution: 'override' }];
	}

	return {
		ssg,
		mode: options?.mode ?? DEFAULT_MODE,
		build: {
			install_command: buildCommands.install[0]?.value,
			build_command: buildCommands.build[0]?.value,
			output_path: buildCommands.output[0]?.value,
			environment_variables: envVars.length > 0 ? envVars : undefined,
			preserved_paths: buildCommands.preserved?.map((s) => s.value).join(',') || undefined,
		},
	};
}

function collectionsToOptions(
	trees: CollectionConfigTree[],
	depth: number = 0
): Array<{ value: string; label: string; hint?: string }> {
	let options: Array<{ value: string; label: string; hint?: string }> = [];
	trees = [...trees].sort((a, b) =>
		a.key.replace(/^_+/, '').localeCompare(b.key.replace(/^_+/, ''))
	);

	for (let i = 0; i < trees.length; i++) {
		options.push({
			value: trees[i].key,
			label: `/${trees[i].config.path}`,
			hint: trees[i].suggested ? 'suggested' : undefined,
		});

		options = options.concat(collectionsToOptions(trees[i].collections, depth + 1));
	}

	return options;
}

function getSuggestedKeys(trees: CollectionConfigTree[]): string[] {
	const keys: string[] = [];
	for (let i = 0; i < trees.length; i++) {
		if (trees[i].suggested) {
			keys.push(trees[i].key);
		}
		keys.push(...getSuggestedKeys(trees[i].collections));
	}
	return keys;
}

function pickCollections(
	trees: CollectionConfigTree[],
	selectedKeys: Set<string>
): Record<string, CollectionConfig> {
	const result: Record<string, CollectionConfig> = {};

	function walk(nodes: CollectionConfigTree[]): void {
		for (let i = 0; i < nodes.length; i++) {
			if (selectedKeys.has(nodes[i].key)) {
				result[nodes[i].key] = nodes[i].config;
			}
			walk(nodes[i].collections);
		}
	}

	walk(trees);
	return result;
}

function exitOnCancel<T>(value: T | symbol): asserts value is T {
	if (p.isCancel(value)) {
		p.cancel('Operation cancelled.');
		process.exit(0);
	}
}

async function promptSsg(detectedSsg: SsgKey): Promise<SsgKey> {
	const options = Object.keys(ssgs)
		.filter((key) => key !== 'legacy' && key !== 'other')
		.map((key) => ({ value: key, label: key, hint: key === detectedSsg ? 'detected' : '' }));

	options.push({ value: 'other', label: 'other', hint: '' });

	const ssgChoice = await p.select({
		message: 'Which static site generator does this site use?',
		options,
		initialValue: detectedSsg,
	});

	exitOnCancel(ssgChoice);
	return checkSsg(ssgChoice) ?? 'other';
}

async function promptSource(detectedSource: string | undefined): Promise<string | undefined> {
	const sourceNote = secondary('(the subfolder containing your site files)');

	if (detectedSource) {
		const confirmSource = await p.confirm({
			message: `Use ${em(`/${detectedSource}`)} as the source folder? ${sourceNote}`,
			initialValue: true,
		});

		exitOnCancel(confirmSource);
		if (confirmSource) {
			return detectedSource;
		}

		const customSource = await p.text({ message: 'Enter the source folder path:' });
		exitOnCancel(customSource);
		return customSource;
	}

	const wantSource = await p.confirm({
		message: `Set a source folder? ${sourceNote}`,
		initialValue: false,
	});

	exitOnCancel(wantSource);
	if (wantSource) {
		const customSource = await p.text({ message: 'Enter the source folder path:' });
		exitOnCancel(customSource);
		return customSource;
	}
}

async function promptCollections(detectedCollections: CollectionConfigTree[]): Promise<string[]> {
	const options = collectionsToOptions(detectedCollections);
	const initialValues = getSuggestedKeys(detectedCollections);

	if (options.length > 0) {
		const collectionChoice = await p.multiselect({
			message: `Select which content folders you want as Collections: ${secondary('(how your content is grouped)')}`,
			options,
			initialValues,
			required: false,
		});

		exitOnCancel(collectionChoice);
		return collectionChoice;
	}

	p.note('No collections detected.', 'Collections');
	return [];
}

async function promptBuildSuggestion(
	message: string,
	suggestions: BuildCommandSuggestion[]
): Promise<string | undefined> {
	if (suggestions.length === 0) return;

	const options = [
		...suggestions.map(({ value, attribution }) => ({
			value,
			label: value,
			hint: attribution,
		})),
		{
			value: '__none__',
			label: 'None',
			hint: '',
		},
	];

	const choice = await p.select({
		message,
		options,
		initialValue: suggestions[0]?.value,
	});

	exitOnCancel(choice);
	return choice === '__none__' ? undefined : choice;
}

async function confirmAndWrite(path: string, content: string, dryRun: boolean): Promise<void> {
	if (dryRun) {
		return;
	}

	const shouldWrite = await p.confirm({
		message: `Create this file at ${em(path)}?`,
		initialValue: true,
	});

	exitOnCancel(shouldWrite);
	if (shouldWrite) {
		await writeFileAndFolder(path, content);
		p.log.success(`${success('Wrote:')} ${path}`);
	}
}

async function writeOrLog(path: string, content: string, dryRun: boolean): Promise<void> {
	if (dryRun) {
		console.log(em(basename(path)));
		console.log(content);
	} else {
		await writeFileAndFolder(path, content);
		console.log(`${success('Wrote:')} ${path}`);
	}
}

async function generateInteractive(
	targetPath: string,
	options: {
		ssg?: SsgKey;
		source?: string;
		format: Format;
		'dry-run'?: boolean;
		output?: string;
		mode?: Mode;
		'initial-site-settings'?: boolean;
		'initial-site-settings-only'?: boolean;
		'install-command'?: string;
		'build-command'?: string;
		'output-path'?: string;
	}
): Promise<void> {
	p.intro('CloudCannon');

	const spinner = p.spinner();
	spinner.start('Scanning files...');
	const filePaths = await getFilePaths(targetPath);
	const readFile = readFileFn(targetPath);
	spinner.stop(`Scanned ${filePaths.length} files.`);

	const ssg = options?.ssg ?? (await promptSsg(detectSsg(filePaths).ssg));
	const source = options?.source ?? (await promptSource(ssgs[ssg].getSource(filePaths)));

	spinner.start('Generating configuration...');
	const result = await generateConfiguration(filePaths, {
		config: source ? { source } : undefined,
		buildConfig: { ssg },
		readFile,
	});
	spinner.stop('Generated configuration.');

	const selectedCollectionKeys = await promptCollections(result.collections);

	if (!options?.['initial-site-settings-only']) {
		const config = { ...result.config };
		if (selectedCollectionKeys.length > 0) {
			const selectedSet = new Set(selectedCollectionKeys);
			config.collections_config = ssgs[ssg].sortCollectionsConfig(
				pickCollections(result.collections, selectedSet)
			);
		}

		const ext = extensionFromFormat(options.format);
		const configOutputPath = options.output ?? resolve(targetPath, `cloudcannon.config.${ext}`);
		const configContent = stringify(config, options.format);

		p.note(configContent, em(`cloudcannon.config.${ext}`));
		await confirmAndWrite(configOutputPath, configContent, !!options?.['dry-run']);
	}

	const wantInitSettings =
		options?.['initial-site-settings'] ??
		options?.['initial-site-settings-only'] ??
		(await p.confirm({
			message: `Generate ${em('.cloudcannon/initial-site-settings.json')}?`,
			initialValue: true,
		}));
	exitOnCancel(wantInitSettings);

	if (wantInitSettings) {
		const buildCommands = await generateBuildCommands(filePaths, {
			config: source ? { source } : undefined,
			buildConfig: { ssg },
			readFile,
		});

		const settings = generateInitialSiteSettings(ssg, buildCommands, {
			mode: options?.mode,
			overrides: {
				install:
					options?.['install-command'] ??
					(await promptBuildSuggestion('Install command:', buildCommands.install)),
				build:
					options?.['build-command'] ??
					(await promptBuildSuggestion('Build command:', buildCommands.build)),
				output:
					options?.['output-path'] ??
					(await promptBuildSuggestion('Output path:', buildCommands.output)),
			},
		});
		const settingsContent = stringify(settings, 'json');
		const settingsPath = resolve(targetPath, '.cloudcannon/initial-site-settings.json');

		p.note(settingsContent, em('.cloudcannon/initial-site-settings.json'));
		await confirmAndWrite(settingsPath, settingsContent, !!options?.['dry-run']);
	}

	p.outro(success('Done!'));
}

async function generateAuto(
	targetPath: string,
	options: {
		source?: string;
		ssg?: SsgKey;
		'dry-run'?: boolean;
		format: Format;
		output?: string;
		mode?: Mode;
		'initial-site-settings'?: boolean;
		'initial-site-settings-only'?: boolean;
		'install-command'?: string;
		'build-command'?: string;
		'output-path'?: string;
	}
): Promise<void> {
	const filePaths = await getFilePaths(targetPath);
	const readFile = readFileFn(targetPath);
	const result = await generateConfiguration(filePaths, {
		config: options.source ? { source: options.source } : undefined,
		buildConfig: options.ssg ? { ssg: options.ssg } : undefined,
		readFile,
	});

	const ssg = result.ssg ?? 'other';
	const config = { ...result.config };
	const suggested = flattenCollectionTree(result.collections, { onlySuggested: true });

	if (Object.keys(suggested).length > 0) {
		config.collections_config = ssgs[ssg].sortCollectionsConfig(suggested);
	}

	if (!options['initial-site-settings-only']) {
		const content = stringify(config, options.format);
		const path =
			options.output ??
			resolve(targetPath, `cloudcannon.config.${extensionFromFormat(options.format)}`);

		await writeOrLog(path, content, !!options['dry-run']);
	}

	if (options['initial-site-settings'] || options['initial-site-settings-only']) {
		const buildCommands = await generateBuildCommands(filePaths, {
			config: options.source ? { source: options.source } : undefined,
			buildConfig: ssg ? { ssg } : undefined,
			readFile,
		});

		const settings = generateInitialSiteSettings(ssg, buildCommands, {
			mode: options.mode,
			overrides: {
				install: options['install-command'],
				build: options['build-command'],
				output: options['output-path'],
			},
		});

		const content = stringify(settings, 'json');
		const path = resolve(targetPath, '.cloudcannon', 'initial-site-settings.json');

		await writeOrLog(path, content, !!options['dry-run']);
	}
}

const args = {
	...pathArg,
	...sourceArg,
	...ssgArg,
	...modeArg,
	auto: {
		type: 'boolean',
		default: false,
		description: 'Non-interactive mode, accept all suggestions',
	},
	'dry-run': {
		type: 'boolean',
		default: false,
		description: 'Log output instead of writing to files',
	},
	format: {
		type: 'string',
		description: 'Output format',
		default: DEFAULT_FORMAT,
		valueHint: 'yaml|json',
	},
	output: {
		type: 'string',
		description: 'Output file path',
		valueHint: 'path',
	},
	'initial-site-settings': {
		type: 'boolean',
		default: false,
		description: `Also generate ${em('initial-site-settings.json')} file`,
	},
	'initial-site-settings-only': {
		type: 'boolean',
		default: false,
		description: `Only generate ${em('initial-site-settings.json')} file`,
	},
	'install-command': {
		type: 'string',
		description: 'Override install command',
		valueHint: 'command',
	},
	'build-command': {
		type: 'string',
		description: 'Override build command',
		valueHint: 'command',
	},
	'output-path': {
		type: 'string',
		description: 'Override output path',
		valueHint: 'path',
	},
} as const;

export const generateCommand = defineCommand({
	meta: {
		name: 'generate',
		description: 'Generate CloudCannon configuration files',
	},
	args,
	async run(ctx: CommandContext<typeof args>): Promise<void> {
		const targetPath = resolve(ctx.args.path ?? '.');

		const options = {
			ssg: checkSsg(ctx.args.ssg),
			source: ctx.args.source,
			'dry-run': ctx.args['dry-run'],
			mode: checkMode(ctx.args.mode),
			format: checkFormat(ctx.args.format) ?? DEFAULT_FORMAT,
			output: ctx.args.output,
			'initial-site-settings': ctx.args['initial-site-settings'],
			'initial-site-settings-only': ctx.args['initial-site-settings-only'],
			'install-command': ctx.args['install-command'],
			'build-command': ctx.args['build-command'],
			'output-path': ctx.args['output-path'],
		};

		if (ctx.args.auto) {
			return await generateAuto(targetPath, options);
		}

		await generateInteractive(targetPath, options);
	},
});
