import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import * as p from '@clack/prompts';
import type { CollectionConfig } from '@cloudcannon/configuration-types';
import {
	type CollectionConfigTree,
	generateBuildCommands,
	generateConfiguration,
	type SsgKey,
	ssgs,
} from '@cloudcannon/gadget';
import type { Format, Mode } from '../utility.ts';
import {
	flattenCollectionTree,
	getFilePaths,
	printJson,
	readFileFn,
	serializeConfig,
	success,
} from '../utility.ts';
import { buildInitialSiteSettings } from './initial-site-settings.ts';
import { detectSsg } from './ssg.ts';

export async function cmdDetectSource(
	targetPath: string,
	options: { ssg?: SsgKey }
): Promise<void> {
	const filePaths = await getFilePaths(targetPath);
	const ssg = options.ssg ?? detectSsg(filePaths).ssg;

	printJson({
		source: ssgs[ssg].getSource(filePaths) ?? null,
		ssg,
	});
}

export async function cmdCollections(
	targetPath: string,
	options: { source?: string; ssg?: SsgKey }
): Promise<void> {
	const filePaths = await getFilePaths(targetPath);
	const result = await generateConfiguration(filePaths, {
		config: options.source ? { source: options.source } : undefined,
		buildConfig: options.ssg ? { ssg: options.ssg } : undefined,
		readFile: readFileFn(targetPath),
	});

	printJson({
		collections: result.collections,
		ssg: result.ssg,
		source: result.config.source ?? null,
	});
}

export async function cmdBuild(
	targetPath: string,
	options: { source?: string; ssg?: SsgKey }
): Promise<void> {
	const filePaths = await getFilePaths(targetPath);
	const buildCommands = await generateBuildCommands(filePaths, {
		config: options.source ? { source: options.source } : undefined,
		buildConfig: options.ssg ? { ssg: options.ssg } : undefined,
		readFile: readFileFn(targetPath),
	});

	printJson(buildCommands);
}

// --- Interactive generate ---

function collectionsToOptions(
	trees: CollectionConfigTree[],
	depth: number = 0
): Array<{ value: string; label: string; hint?: string }> {
	const options: Array<{ value: string; label: string; hint?: string }> = [];
	for (const tree of trees) {
		const indent = '  '.repeat(depth);
		options.push({
			value: tree.key,
			label: `${indent}${tree.key}`,
			hint: tree.config.path ?? '',
		});
		options.push(...collectionsToOptions(tree.collections, depth + 1));
	}
	return options;
}

function getSuggestedKeys(trees: CollectionConfigTree[]): string[] {
	const keys: string[] = [];
	for (const tree of trees) {
		if (tree.suggested) {
			keys.push(tree.key);
		}
		keys.push(...getSuggestedKeys(tree.collections));
	}
	return keys;
}

function pickCollections(
	trees: CollectionConfigTree[],
	selectedKeys: Set<string>
): Record<string, CollectionConfig> {
	const result: Record<string, CollectionConfig> = {};

	function walk(nodes: CollectionConfigTree[]): void {
		for (const node of nodes) {
			if (selectedKeys.has(node.key)) {
				result[node.key] = node.config;
			}
			walk(node.collections);
		}
	}

	walk(trees);
	return result;
}

function exitOnCancel(value: unknown): void {
	if (p.isCancel(value)) {
		p.cancel('Operation cancelled.');
		process.exit(0);
	}
}

export async function cmdGenerateInteractive(
	targetPath: string,
	options: {
		format?: Format;
		output?: string;
	}
): Promise<void> {
	p.intro('CloudCannon CLI');

	const spinner = p.spinner();
	spinner.start('Scanning files...');
	const filePaths = await getFilePaths(targetPath);
	const readFile = readFileFn(targetPath);
	spinner.stop(`Found ${filePaths.length} files`);

	// Step 1: SSG detection
	const detection = detectSsg(filePaths);
	const ssgOptions = Object.keys(ssgs)
		.filter((key) => key !== 'legacy' && key !== 'other')
		.map((key) => ({ value: key, label: key, hint: key === detection.ssg ? 'detected' : '' }));
	ssgOptions.push({ value: 'other', label: 'other', hint: '' });

	const ssgChoice = await p.select({
		message: 'Which static site generator does this site use?',
		options: ssgOptions,
		initialValue: detection.ssg,
	});
	exitOnCancel(ssgChoice);
	const ssgKey = ssgChoice as SsgKey;

	// Step 2: Source folder
	const ssg = ssgs[ssgKey];
	const detectedSource = ssg.getSource(filePaths);

	let source: string | undefined;
	if (detectedSource) {
		const confirmSource = await p.confirm({
			message: `Detected source folder: ${detectedSource}. Is this correct?`,
			initialValue: true,
		});
		exitOnCancel(confirmSource);
		if (confirmSource) {
			source = detectedSource;
		} else {
			const customSource = await p.text({
				message: 'Enter the source folder path:',
				placeholder: 'src',
			});
			exitOnCancel(customSource);
			source = (customSource as string) || undefined;
		}
	} else {
		const wantSource = await p.confirm({
			message: 'No source folder detected. Do you want to set one?',
			initialValue: false,
		});
		exitOnCancel(wantSource);
		if (wantSource) {
			const customSource = await p.text({
				message: 'Enter the source folder path:',
				placeholder: 'src',
			});
			exitOnCancel(customSource);
			source = (customSource as string) || undefined;
		}
	}

	// Step 3: Generate configuration
	spinner.start('Generating configuration...');
	const result = await generateConfiguration(filePaths, {
		config: source ? { source } : undefined,
		buildConfig: { ssg: ssgKey },
		readFile,
	});
	spinner.stop('Configuration generated');

	// Step 4: Collections
	const collectionOptions = collectionsToOptions(result.collections);
	const suggestedKeys = getSuggestedKeys(result.collections);

	let selectedCollectionKeys: string[];
	if (collectionOptions.length > 0) {
		const collectionChoice = await p.multiselect({
			message: 'Select collections to include:',
			options: collectionOptions,
			initialValues: suggestedKeys,
			required: false,
		});
		exitOnCancel(collectionChoice);
		selectedCollectionKeys = collectionChoice as string[];
	} else {
		p.note('No collections detected.', 'Collections');
		selectedCollectionKeys = [];
	}

	// Step 5: Build commands
	const buildCommands = await generateBuildCommands(filePaths, {
		config: source ? { source } : undefined,
		buildConfig: { ssg: ssgKey },
		readFile,
	});

	let installCommand: string | undefined;
	if (buildCommands.install.length > 0) {
		const installOptions = [
			...buildCommands.install.map((s) => ({
				value: s.value,
				label: s.value,
				hint: s.attribution,
			})),
			{ value: '__none__', label: 'None', hint: '' },
		];
		const choice = await p.select({
			message: 'Install command:',
			options: installOptions,
			initialValue: buildCommands.install[0]?.value,
		});
		exitOnCancel(choice);
		installCommand = choice === '__none__' ? undefined : (choice as string);
	}

	let buildCommand: string | undefined;
	if (buildCommands.build.length > 0) {
		const buildOptions = [
			...buildCommands.build.map((s) => ({
				value: s.value,
				label: s.value,
				hint: s.attribution,
			})),
			{ value: '__none__', label: 'None', hint: '' },
		];
		const choice = await p.select({
			message: 'Build command:',
			options: buildOptions,
			initialValue: buildCommands.build[0]?.value,
		});
		exitOnCancel(choice);
		buildCommand = choice === '__none__' ? undefined : (choice as string);
	}

	let outputPath: string | undefined;
	if (buildCommands.output.length > 0) {
		const outputOptions = [
			...buildCommands.output.map((s) => ({
				value: s.value,
				label: s.value,
				hint: s.attribution,
			})),
			{ value: '__none__', label: 'None', hint: '' },
		];
		const choice = await p.select({
			message: 'Output path:',
			options: outputOptions,
			initialValue: buildCommands.output[0]?.value,
		});
		exitOnCancel(choice);
		outputPath = choice === '__none__' ? undefined : (choice as string);
	}

	// Step 6: Assemble config
	const config = { ...result.config };
	if (selectedCollectionKeys.length > 0) {
		const selectedSet = new Set(selectedCollectionKeys);
		config.collections_config = ssg.sortCollectionsConfig(
			pickCollections(result.collections, selectedSet)
		);
	}

	const format = options.format ?? 'yaml';
	const ext = format === 'json' ? 'json' : 'yml';
	const configOutputPath = options.output ?? resolve(targetPath, `cloudcannon.config.${ext}`);
	const configContent = serializeConfig(config, format);

	// Step 7: Preview
	p.note(configContent, `cloudcannon.config.${ext}`);

	const shouldWrite = await p.confirm({
		message: 'Write this configuration?',
		initialValue: true,
	});
	exitOnCancel(shouldWrite);

	if (shouldWrite) {
		await writeFile(configOutputPath, configContent);
		p.log.success(`Wrote ${configOutputPath}`);
	}

	// Step 8: Initial site settings
	const wantInitSettings = await p.confirm({
		message: 'Generate .cloudcannon/initial-site-settings.json?',
		initialValue: true,
	});
	exitOnCancel(wantInitSettings);

	if (wantInitSettings) {
		const modifiedBuildCommands = { ...buildCommands };
		if (installCommand) {
			modifiedBuildCommands.install = [
				{ value: installCommand, attribution: 'user selection' },
				...buildCommands.install.filter((s) => s.value !== installCommand),
			];
		}
		if (buildCommand) {
			modifiedBuildCommands.build = [
				{ value: buildCommand, attribution: 'user selection' },
				...buildCommands.build.filter((s) => s.value !== buildCommand),
			];
		}
		if (outputPath) {
			modifiedBuildCommands.output = [
				{ value: outputPath, attribution: 'user selection' },
				...buildCommands.output.filter((s) => s.value !== outputPath),
			];
		}

		const settings = buildInitialSiteSettings(ssgKey, modifiedBuildCommands);
		const settingsPath = resolve(targetPath, '.cloudcannon', 'initial-site-settings.json');
		const dir = dirname(settingsPath);
		await mkdir(dir, { recursive: true });

		const settingsContent = serializeConfig(settings, 'json');
		await writeFile(settingsPath, settingsContent);
		p.log.success(`Wrote ${settingsPath}`);
	}

	p.outro('Done!');
}

// --- Non-interactive generate ---

export async function cmdGenerateAuto(
	targetPath: string,
	options: {
		source?: string;
		ssg?: SsgKey;
		json?: boolean;
		format?: Format;
		output?: string;
		mode?: Mode;
		'init-settings'?: boolean;
	}
): Promise<void> {
	const filePaths = await getFilePaths(targetPath);
	const readFile = readFileFn(targetPath);
	const ssgKey = options.ssg;

	const result = await generateConfiguration(filePaths, {
		config: options.source ? { source: options.source } : undefined,
		buildConfig: ssgKey ? { ssg: ssgKey } : undefined,
		readFile,
	});

	const config = { ...result.config };
	const suggested = flattenCollectionTree(result.collections, { onlySuggested: true });
	if (Object.keys(suggested).length > 0) {
		const ssg = ssgs[result.ssg ?? 'other'];
		config.collections_config = ssg.sortCollectionsConfig(suggested);
	}

	if (options.json) {
		printJson({
			ssg: result.ssg,
			config,
			collections: result.collections,
		});
		return;
	}

	const format = options.format ?? 'yaml';
	const ext = format === 'json' ? 'json' : 'yml';
	const configOutputPath = options.output ?? resolve(targetPath, `cloudcannon.config.${ext}`);
	const configContent = serializeConfig(config, format);

	await writeFile(configOutputPath, configContent);
	console.log(`${success('Wrote:')} ${configOutputPath}`);

	if (options['init-settings']) {
		const buildCommands = await generateBuildCommands(filePaths, {
			config: options.source ? { source: options.source } : undefined,
			buildConfig: ssgKey ? { ssg: ssgKey } : undefined,
			readFile,
		});

		const detectedSsg = result.ssg ?? 'other';
		const mode = options.mode ?? 'hosted';
		const settings = buildInitialSiteSettings(detectedSsg, buildCommands, { mode });

		const settingsPath = resolve(targetPath, '.cloudcannon', 'initial-site-settings.json');
		const dir = dirname(settingsPath);
		await mkdir(dir, { recursive: true });

		const settingsContent = serializeConfig(settings, 'json');
		await writeFile(settingsPath, settingsContent);
		console.log(`${success('Wrote:')} ${settingsPath}`);
	}
}
