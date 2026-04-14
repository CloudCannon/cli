import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { styleText } from 'node:util';
import type { CollectionConfig } from '@cloudcannon/configuration-types';
import type { CollectionConfigTree } from '@cloudcannon/gadget';
import { stringify } from 'yaml';

export type Mode = 'hosted' | 'headless';
export type Format = 'yaml' | 'json';

export async function getFilePaths(targetPath: string): Promise<string[]> {
	const entries = await readdir(targetPath, { recursive: true, withFileTypes: true });
	const files = entries.filter((entry) => entry.isFile());
	const filePaths = files.map((file) =>
		resolve(file.parentPath, file.name).substring(targetPath.length + 1)
	);
	filePaths.sort();
	return filePaths;
}

export function readFileFn(targetPath: string): (path: string) => Promise<string | undefined> {
	return async (path: string): Promise<string | undefined> => {
		try {
			return await readFile(resolve(targetPath, path), 'utf-8');
		} catch {
			return;
		}
	};
}

/**
 * Walks a CollectionConfigTree and returns a flat Record of collection configs.
 */
export function flattenCollectionTree(
	trees: CollectionConfigTree[],
	options?: { onlySuggested?: boolean }
): Record<string, CollectionConfig> {
	const result: Record<string, CollectionConfig> = {};
	const onlySuggested = options?.onlySuggested ?? true;

	function walk(nodes: CollectionConfigTree[]): void {
		for (const node of nodes) {
			if (!onlySuggested || node.suggested) {
				result[node.key] = node.config;
			}
			walk(node.collections);
		}
	}

	walk(trees);
	return result;
}

/**
 * Serializes a config object to YAML or JSON, including the appropriate schema reference.
 */
export function serializeConfig(config: Record<string, any>, format: Format): string {
	if (format === 'json') {
		return `${JSON.stringify(config, null, 2)}\n`;
	}

	return stringify(config, {
		lineWidth: 0,
		singleQuote: true,
		aliasDuplicateObjects: false,
	});
}

export function printJson(data: unknown): void {
	console.log(JSON.stringify(data, null, 2));
}

export function heading(text: string): string {
	return styleText(['bold'], text);
}

export function em(text: string): string {
	return styleText(['blue', 'italic'], text);
}

export function success(text: string): string {
	return styleText(['green'], text);
}

export function warning(text: string): string {
	return styleText(['red'], text);
}

export function list(
	list: { value: string; description?: string }[] | undefined,
	maxKeyLength: number
): string | undefined {
	return list
		?.map(
			({ value, description }) =>
				`${value}${' '.repeat(maxKeyLength - value.length)}${LIST_GAP}${description}`
		)
		.join(`${INDENT}\n${INDENT}`);
}

const INDENT = '  ';
const LIST_GAP = '  ';

export function printHelp(options?: {
	description?: string;
	command?: string;
	subcommand?: string;
	arg?: string;
	commands?: { value: string; description?: string }[];
	flags?: { value: string; description?: string }[];
	args?: { value: string; description?: string }[];
}): void {
	const maxKeyLength = Math.max(
		...[
			...(options?.commands?.map((c) => c.value.length) || []),
			...(options?.flags?.map((c) => c.value.length) || []),
			...(options?.args?.map((c) => c.value.length) || []),
		]
	);

	const description = options?.description ?? 'Work with CloudCannon from the command line.';
	const command = options?.command ?? '<command>';
	const subcommand = options?.subcommand ?? '<subcommand>';
	const arg = options?.arg ?? '[arguments]';
	const commands = list(options?.commands, maxKeyLength);
	const flags = list(options?.flags, maxKeyLength);
	const args = list(options?.args, maxKeyLength);

	const sections = [
		description,
		`${heading('USAGE')}\n${INDENT}cloudcannon ${command} ${subcommand} ${arg} [flags]`,
		commands?.length ? `${heading('COMMANDS')}\n${INDENT}${commands}` : undefined,
		flags?.length ? `${heading('FLAGS')}\n${INDENT}${flags}` : undefined,
		args?.length ? `${heading('ARGUMENTS')}\n${INDENT}${args}` : undefined,
		`${heading('EXAMPLES')}
${INDENT}$ cloudcannon
${INDENT}$ cloudcannon configure generate --auto
${INDENT}$ cloudcannon configure detect-ssg
${INDENT}$ cloudcannon configure collections --ssg astro
${INDENT}$ cloudcannon configure generate --auto --init-settings`,
		`${heading('LEARN MORE')}
${INDENT}Use ${em('cloudcannon <command> [subcommand] --help')} for details about a command.
${INDENT}Read the documentation at ${em('https://cloudcannon.com/documentation/')}`,
	];

	console.log(sections.filter(Boolean).join('\n\n'));
}
