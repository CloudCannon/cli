import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { SsgKey } from '@cloudcannon/configuration-types';
import {
	type BuildCommands,
	type GenerateOptions,
	generateBuildCommands,
} from '@cloudcannon/gadget';
import { getFilePaths, type Mode, readFileFn, serializeConfig, success } from '../utility.ts';
import { detectSsg } from './ssg.ts';

export interface InitialSiteSettings {
	ssg: SsgKey;
	mode: Mode;
	build: {
		install_command?: string;
		build_command?: string;
		output_path?: string;
		environment_variables?: Array<{ key: string; value: string }>;
		preserved_paths?: string[];
	};
}

/**
 * Converts BuildCommands suggestions into an InitialSiteSettings object,
 * picking the first (best) suggestion from each category.
 */
export function buildInitialSiteSettings(
	ssg: SsgKey,
	buildCommands: BuildCommands,
	options?: { mode?: Mode }
): InitialSiteSettings {
	const envVars = Object.entries(buildCommands.environment).map(([key, suggestion]) => ({
		key,
		value: suggestion.value,
	}));

	return {
		ssg,
		mode: options?.mode ?? 'hosted',
		build: {
			install_command: buildCommands.install[0]?.value,
			build_command: buildCommands.build[0]?.value,
			output_path: buildCommands.output[0]?.value,
			environment_variables: envVars.length > 0 ? envVars : undefined,
			preserved_paths:
				buildCommands.preserved.length > 0
					? buildCommands.preserved.map((s) => s.value)
					: undefined,
		},
	};
}

/**
 * Generates initial site settings by detecting the SSG and build commands.
 */
export async function generateInitialSiteSettings(
	filePaths: string[],
	options?: GenerateOptions & { mode?: Mode }
): Promise<InitialSiteSettings> {
	const buildCommands = await generateBuildCommands(filePaths, options);
	const ssgKey = options?.buildConfig?.ssg ?? detectSsg(filePaths).ssg;

	return buildInitialSiteSettings(ssgKey, buildCommands, { mode: options?.mode });
}

export async function cmdInitSettings(
	targetPath: string,
	options: {
		mode?: Mode;
		source?: string;
		ssg?: SsgKey;
		'install-command'?: string;
		'build-command'?: string;
		'output-path'?: string;
	}
): Promise<void> {
	const filePaths = await getFilePaths(targetPath);
	const mode = options.mode ?? 'hosted';
	const buildCommands = await generateBuildCommands(filePaths, {
		config: options.source ? { source: options.source } : undefined,
		buildConfig: options.ssg ? { ssg: options.ssg } : undefined,
		readFile: readFileFn(targetPath),
	});

	const ssg = options.ssg ?? detectSsg(filePaths).ssg;
	const settings = buildInitialSiteSettings(ssg, buildCommands, { mode });

	if (options['install-command']) {
		settings.build.install_command = options['install-command'];
	}

	if (options['build-command']) {
		settings.build.build_command = options['build-command'];
	}

	if (options['output-path']) {
		settings.build.output_path = options['output-path'];
	}

	const settingsPath = resolve(targetPath, '.cloudcannon', 'initial-site-settings.json');
	const dir = dirname(settingsPath);
	await mkdir(dir, { recursive: true });

	const content = serializeConfig(settings, 'json');
	await writeFile(settingsPath, content);

	console.log(`${success('Wrote:')} ${settingsPath}`);
}
