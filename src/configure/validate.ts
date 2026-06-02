import { access, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { type GlobTypeKey, loadConfiguration } from '@cloudcannon/configuration-loader';
import type { Configuration } from '@cloudcannon/configuration-types';
import collectionsSchema from '@cloudcannon/configuration-types/dist/cloudcannon-collections.schema.json' with {
	type: 'json',
};
import configSchema from '@cloudcannon/configuration-types/dist/cloudcannon-config.latest.schema.json' with {
	type: 'json',
};
import editablesSchema from '@cloudcannon/configuration-types/dist/cloudcannon-editables.schema.json' with {
	type: 'json',
};
import settingsSchema from '@cloudcannon/configuration-types/dist/cloudcannon-initial-site-settings.schema.json' with {
	type: 'json',
};
import inputsSchema from '@cloudcannon/configuration-types/dist/cloudcannon-inputs.schema.json' with {
	type: 'json',
};
import routingSchema from '@cloudcannon/configuration-types/dist/cloudcannon-routing.schema.json' with {
	type: 'json',
};
import schemasSchema from '@cloudcannon/configuration-types/dist/cloudcannon-schemas.schema.json' with {
	type: 'json',
};
import snippetsSchema from '@cloudcannon/configuration-types/dist/cloudcannon-snippets.schema.json' with {
	type: 'json',
};
import snippetsDefinitionsSchema from '@cloudcannon/configuration-types/dist/cloudcannon-snippets-definitions.schema.json' with {
	type: 'json',
};
import snippetsImportsSchema from '@cloudcannon/configuration-types/dist/cloudcannon-snippets-imports.schema.json' with {
	type: 'json',
};
import structureValueSchema from '@cloudcannon/configuration-types/dist/cloudcannon-structure-value.schema.json' with {
	type: 'json',
};
import structuresSchema from '@cloudcannon/configuration-types/dist/cloudcannon-structures.schema.json' with {
	type: 'json',
};
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import { type CommandContext, defineCommand } from 'citty';
import { parse as parseYaml } from 'yaml';
import { pathArg, text } from './utility.ts';

const CONFIG_FILENAMES = [
	'cloudcannon.config.yml',
	'cloudcannon.config.yaml',
	'cloudcannon.config.json',
] as const;

const SETTINGS_PATH = '.cloudcannon/initial-site-settings.json';
const ROUTING_PATH = '.cloudcannon/routing.json';

const ajv = new Ajv({ strict: false, allErrors: true, verbose: true });
const validateConfig = ajv.compile(configSchema);
const validateSettings = ajv.compile(settingsSchema);
const validateRouting = ajv.compile(routingSchema);
const validateCollections = ajv.compile(collectionsSchema);
const validateEditables = ajv.compile(editablesSchema);
const validateInputs = ajv.compile(inputsSchema);
const validateSchemas = ajv.compile(schemasSchema);
const validateSnippets = ajv.compile(snippetsSchema);
const validateSnippetsDefinitions = ajv.compile(snippetsDefinitionsSchema);
const validateSnippetsImports = ajv.compile(snippetsImportsSchema);
const validateStructureValue = ajv.compile(structureValueSchema);
const validateStructures = ajv.compile(structuresSchema);

const GLOB_KEY_VALIDATORS: Partial<Record<GlobTypeKey, ValidateFunction>> = {
	collections_config_from_glob: validateCollections,
	schemas_from_glob: validateSchemas,
	_editables_from_glob: validateEditables,
	_inputs_from_glob: validateInputs,
	_snippets_from_glob: validateSnippets,
	_snippets_definitions_from_glob: validateSnippetsDefinitions,
	_snippets_imports_from_glob: validateSnippetsImports,
	_structures_from_glob: validateStructures,
	values_from_glob: validateStructureValue,
};

async function findSplitConfigFiles(
	configPath: string,
	parsedConfig: Configuration,
	targetPath: string
): Promise<Array<{ filePath: string; validate: ValidateFunction }>> {
	const { pathsToGlobKey } = await loadConfiguration(configPath, {
		parseFile: (contents: string, filePath: string) => {
			if (filePath === configPath) {
				return parsedConfig;
			}

			return filePath.endsWith('.json') ? JSON.parse(contents) : parseYaml(contents);
		},
	});

	const entries = Object.entries(pathsToGlobKey);
	const results: Array<{ filePath: string; validate: ValidateFunction }> = [];

	for (let i = 0; i < entries.length; i++) {
		const [filePath, globKey] = entries[i];
		const validate = GLOB_KEY_VALIDATORS[globKey];
		if (validate) {
			results.push({ filePath, validate });
		} else {
			console.log(`- unable to validate: ${text.em(relative(targetPath, filePath))}`);
		}
	}

	return results;
}

// Collapses duplicate non-value errors emitted once per oneOf/anyOf branch into one per
// (instancePath, schemaPath, keyword). const/enum are left intact for aggregateValueErrors.
function filterBranchErrors(errors: ErrorObject[]): ErrorObject[] {
	const seen = new Set<string>();
	const result: ErrorObject[] = [];

	for (let i = 0; i < errors.length; i++) {
		if (isValueKeyword(errors[i].keyword)) {
			result.push(errors[i]);
			continue;
		}

		const key = `${errors[i].instancePath}|${errors[i].schemaPath}|${errors[i].keyword}`;
		if (addNew(seen, key)) {
			result.push(errors[i]);
		}
	}

	return result;
}

// When the same field fails across multiple oneOf/anyOf branches (e.g. _inputs.*.type), each
// branch contributes its own const/enum error with a different allowed value. This merges all
// of them into a single enum error so the user sees all valid values at once.
function aggregateValueErrors(errors: ErrorObject[]): ErrorObject[] {
	const allowedValuesMap = new Map<string, Set<unknown>>();

	for (let i = 0; i < errors.length; i++) {
		if (!isValueKeyword(errors[i].keyword)) {
			continue;
		}

		let allowedValues = allowedValuesMap.get(errors[i].instancePath);
		if (!allowedValues) {
			allowedValues = new Set();
			allowedValuesMap.set(errors[i].instancePath, allowedValues);
		}

		if (errors[i].keyword === 'const') {
			allowedValues.add(errors[i].params.allowedValue);
		} else {
			for (let j = 0; j < errors[i].params.allowedValues.length; j++) {
				allowedValues.add(errors[i].params.allowedValues[j]);
			}
		}
	}

	const seen = new Set<string>();
	const result: ErrorObject[] = [];

	for (let i = 0; i < errors.length; i++) {
		if (!isValueKeyword(errors[i].keyword)) {
			result.push(errors[i]);
			continue;
		}

		if (!addNew(seen, errors[i].instancePath)) {
			continue;
		}

		const allowedValues = Array.from(allowedValuesMap.get(errors[i].instancePath) ?? []);
		result.push(
			allowedValues.length === 1 && errors[i].keyword === 'const'
				? errors[i]
				: { ...errors[i], keyword: 'enum', params: { allowedValues } }
		);
	}

	return result;
}

function isValueKeyword(keyword: string): boolean {
	return keyword === 'const' || keyword === 'enum';
}

function isStructuralKeyword(keyword: string): boolean {
	return keyword === 'oneOf' || keyword === 'anyOf' || keyword === 'additionalProperties';
}

// Hide oneOf/anyOf errors when more specific child errors exist
function filterStructuralErrors(errors: ErrorObject[]): ErrorObject[] {
	const compositionPaths = new Set<string>();
	const nonStructuralPaths: string[] = [];

	for (let i = 0; i < errors.length; i++) {
		if (errors[i].keyword === 'oneOf' || errors[i].keyword === 'anyOf') {
			compositionPaths.add(errors[i].instancePath);
		}

		if (!isStructuralKeyword(errors[i].keyword)) {
			nonStructuralPaths.push(errors[i].instancePath);
		}
	}

	return errors.filter(
		(error) =>
			!isStructuralKeyword(error.keyword) ||
			!compositionPaths.has(error.instancePath) ||
			!nonStructuralPaths.some((p) => p.startsWith(`${error.instancePath}/`))
	);
}

function addNew(set: Set<string>, key: string): boolean {
	if (set.has(key)) {
		return false;
	}

	set.add(key);
	return true;
}

function quote(v: unknown): string {
	return typeof v === 'string' ? `'${v}'` : String(v);
}

function formatError(error: ErrorObject): string {
	switch (error.keyword) {
		case 'const':
			return `value ${quote(error.data)} should be ${quote(error.params.allowedValue)}`;
		case 'additionalProperties':
			return `unexpected property '${error.params.additionalProperty}'`;
		case 'enum': {
			const shown = error.params.allowedValues.slice(0, 5).map(quote).join(', ');
			const extra = error.params.allowedValues.length - 5;
			const suffix = extra > 0 ? ` and ${extra} more` : '';
			return `unexpected value ${quote(error.data)}, allowed values: ${shown}${suffix}`;
		}
		case 'type': {
			const expected = Array.isArray(error.params.type)
				? error.params.type.join(' or ')
				: error.params.type;

			const actual = Array.isArray(error.data) ? 'array' : typeof error.data;
			return `unexpected type ${actual} instead of ${expected}`;
		}
		default:
			return error.message ?? 'unknown error';
	}
}

async function findConfigFile(targetPath: string, filePath?: string): Promise<string | undefined> {
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

function checkParsed(displayName: string, validate: ValidateFunction, parsed: unknown): boolean {
	if (validate(parsed)) {
		console.log(`${text.good('✓ valid')}: ${text.em(displayName)}`);
		return true;
	}

	console.log(`${text.bad('✗ invalid')}: ${text.em(displayName)}`);

	const errors = filterStructuralErrors(
		aggregateValueErrors(filterBranchErrors(validate.errors ?? []))
	);

	const seen = new Set<string>();
	for (let i = 0; i < errors.length; i++) {
		const path = errors[i].instancePath ? `$${errors[i].instancePath.replace(/\//g, '.')}` : '$';
		const line = `  ${text.em(path)}: ${formatError(errors[i])}`;
		if (addNew(seen, line)) {
			console.log(line);
		}
	}

	return false;
}

async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString('utf-8');
}

async function readAndParseFile(filePath: string, displayName: string): Promise<unknown | null> {
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

async function checkFile(
	filePath: string,
	validate: ValidateFunction,
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

	return checkParsed(displayName, validate, parsed);
}

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

			const validator = ctx.args.configuration
				? validateConfig
				: ctx.args['initial-site-settings']
					? validateSettings
					: validateRouting;

			const content = await readStdin();
			let parsed: unknown;
			try {
				try {
					parsed = JSON.parse(content);
				} catch {
					parsed = parseYaml(content);
				}
			} catch (err) {
				console.error(`Failed to parse stdin: ${err instanceof Error ? err.message : String(err)}`);
				process.exit(1);
			}

			if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
				console.error('Expected an object from stdin');
				process.exit(1);
			}

			if (!checkParsed('<stdin>', validator, parsed)) {
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

			allValid = checkParsed(configDisplayName, validateConfig, parsedConfig) && allValid;

			const splitConfigFiles = await findSplitConfigFiles(
				configPath,
				parsedConfig as Configuration,
				targetPath
			);
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

		if (!allValid) {
			process.exit(1);
		}
	},
});
