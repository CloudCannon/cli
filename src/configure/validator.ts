import { access, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { loadConfiguration } from '@cloudcannon/configuration-loader';
import type { Configuration } from '@cloudcannon/configuration-types';
import {
	formatInstancePath,
	isSchemaName,
	loadValidator,
	type SchemaName,
} from '@cloudcannon/configuration-types/dist/validate.js';
import { parse as parseYaml } from 'yaml';
import { text } from './utility.ts';

// Everything the `validate` command needs to locate and read the config (and its split files /
// stdin) and print a concise pass/fail report. Schema loading, compilation, and the AJV error
// pipeline live in `@cloudcannon/configuration-types` (shared with the editor); this passes each
// file's schema name to `loadValidator` and prints the results. The command in validate.ts only
// interprets flags and exit codes.

export const SETTINGS_PATH = '.cloudcannon/initial-site-settings.json';
export const ROUTING_PATH = '.cloudcannon/routing.json';
export const CONFIG_FILENAMES = [
	'cloudcannon.config.yml',
	'cloudcannon.config.yaml',
	'cloudcannon.config.json',
] as const;

// Resolves the config file to validate: an explicit path if given, otherwise the first of the
// known filenames that exists under targetPath. Returns undefined when none is found.
export async function findConfigFile(
	targetPath: string,
	filePath?: string
): Promise<string | undefined> {
	const candidates = filePath
		? [resolve(filePath)]
		: CONFIG_FILENAMES.map((f) => resolve(targetPath, f));

	for (const candidate of candidates) {
		try {
			await access(candidate);
			return candidate;
		} catch {
			// intentionally ignored
		}
	}
}

// Discovers the split configuration files referenced from the config (via `*_from_glob` keys),
// pairing each with the schema name for its type. Unknown files are reported and skipped.
export async function findSplitConfigFiles(
	configPath: string,
	parsedConfig: unknown,
	targetPath: string
): Promise<Array<{ filePath: string; name: SchemaName }>> {
	const { pathsToGlobKey } = await loadConfiguration(configPath, {
		parseFile: (contents: string, filePath: string) => {
			if (filePath === configPath) {
				return parsedConfig as Configuration;
			}

			return filePath.endsWith('.json') ? JSON.parse(contents) : parseYaml(contents);
		},
	});

	const entries = Object.entries(pathsToGlobKey);
	const results: Array<{ filePath: string; name: SchemaName }> = [];

	for (let i = 0; i < entries.length; i++) {
		const [filePath, name] = entries[i];
		if (isSchemaName(name)) {
			results.push({ filePath, name });
		} else {
			console.log(`- unable to validate: ${text.em(relative(targetPath, filePath))}`);
		}
	}

	return results;
}

// Reads and parses a YAML/JSON file into an object, printing a message and returning null on a
// missing file, a parse error, or a non-object top level.
export async function readAndParseFile(
	filePath: string,
	displayName: string
): Promise<unknown | null> {
	let content: string;
	try {
		content = await readFile(filePath, 'utf-8');
	} catch {
		console.error(`File not found: ${text.em(displayName)}`);
		return null;
	}

	let parsed: unknown;
	try {
		parsed = filePath.endsWith('.json') ? JSON.parse(content) : parseYaml(content);
	} catch (err) {
		console.error(
			`Failed to parse ${text.em(displayName)}: ${err instanceof Error ? err.message : String(err)}`
		);
		return null;
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		console.error(`Expected an object in ${text.em(displayName)}`);
		return null;
	}

	return parsed;
}

// Reads stdin to completion and parses it as JSON (falling back to YAML), printing a message and
// returning null on a parse error or a non-object top level.
export async function readAndParseStdin(): Promise<unknown | null> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	const content = Buffer.concat(chunks).toString('utf-8');

	let parsed: unknown;
	try {
		try {
			parsed = JSON.parse(content);
		} catch {
			parsed = parseYaml(content);
		}
	} catch (err) {
		console.error(`Failed to parse stdin: ${err instanceof Error ? err.message : String(err)}`);
		return null;
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		console.error('Expected an object from stdin');
		return null;
	}

	return parsed;
}

// Reads a file (optionally skipping a missing one) and validates it, returning whether it's valid.
export async function checkFile(
	filePath: string,
	name: SchemaName,
	targetPath: string,
	optional = false
): Promise<boolean> {
	const displayName = relative(targetPath, filePath);

	if (optional) {
		try {
			await access(filePath);
		} catch {
			return true;
		}
	}

	const parsed = await readAndParseFile(filePath, displayName);
	if (!parsed) {
		return false;
	}

	return checkParsed(displayName, name, parsed);
}

// Validates an already-parsed object against the named schema, printing a pass line or the
// formatted errors, and returns whether it's valid.
export async function checkParsed(
	displayName: string,
	name: SchemaName,
	parsed: unknown
): Promise<boolean> {
	const validator = await loadValidator(name, {
		highlight: (value: unknown) => text.value(String(value)),
	});

	const errors = validator.validate(parsed);
	if (errors.length === 0) {
		console.log(`${text.good('✓ valid')}: ${text.em(displayName)}`);
		return true;
	}

	console.log(`${text.bad('✗ invalid')}: ${text.em(displayName)}`);

	// Deduplicate by the rendered line: identical messages (e.g. the same required/structural
	// error emitted once per union branch) collapse, while distinct ones are all reported.
	const seen = new Set<string>();
	for (let i = 0; i < errors.length; i++) {
		const path = formatInstancePath(errors[i].error.instancePath, parsed);
		const line = `  ${text.em(path)}: ${errors[i].message}`;
		if (!seen.has(line)) {
			seen.add(line);
			console.log(line);
		}
	}

	return false;
}
