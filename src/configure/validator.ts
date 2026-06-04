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
import { Ajv, type AnySchemaObject, type ErrorObject, type ValidateFunction } from 'ajv';
import { closest } from 'fastest-levenshtein';
import { parse as parseYaml } from 'yaml';
import { text } from './utility.ts';

// Everything the `validate` command needs to compile CloudCannon's schemas, locate and read the
// config (and its split files / stdin), and print a concise pass/fail report. The command in
// validate.ts only interprets flags and exit codes; all validation lives here.

export const SETTINGS_PATH = '.cloudcannon/initial-site-settings.json';
export const ROUTING_PATH = '.cloudcannon/routing.json';
export const CONFIG_FILENAMES = [
	'cloudcannon.config.yml',
	'cloudcannon.config.yaml',
	'cloudcannon.config.json',
] as const;

const ajv = new Ajv({ strict: false, allErrors: true, verbose: true });
export const validateConfig = ajv.compile(configSchema);
export const validateSettings = ajv.compile(settingsSchema);
export const validateRouting = ajv.compile(routingSchema);

const GLOB_KEY_VALIDATORS: Partial<Record<GlobTypeKey, ValidateFunction>> = {
	collections_config_from_glob: ajv.compile(collectionsSchema),
	schemas_from_glob: ajv.compile(schemasSchema),
	_editables_from_glob: ajv.compile(editablesSchema),
	_inputs_from_glob: ajv.compile(inputsSchema),
	_snippets_from_glob: ajv.compile(snippetsSchema),
	_snippets_definitions_from_glob: ajv.compile(snippetsDefinitionsSchema),
	_snippets_imports_from_glob: ajv.compile(snippetsImportsSchema),
	_structures_from_glob: ajv.compile(structuresSchema),
	values_from_glob: ajv.compile(structureValueSchema),
};

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
// pairing each with the validator for its type. Files of an unknown type are reported and skipped.
export async function findSplitConfigFiles(
	configPath: string,
	parsedConfig: unknown,
	targetPath: string
): Promise<Array<{ filePath: string; validate: ValidateFunction }>> {
	const { pathsToGlobKey } = await loadConfiguration(configPath, {
		parseFile: (contents: string, filePath: string) => {
			if (filePath === configPath) {
				return parsedConfig as Configuration;
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

// Validates an already-parsed object against a schema, printing a pass line or the formatted
// errors, and returns whether it's valid.
export function checkParsed(
	displayName: string,
	validate: ValidateFunction,
	parsed: unknown
): boolean {
	if (validate(parsed)) {
		console.log(`${text.good('✓ valid')}: ${text.em(displayName)}`);
		return true;
	}

	console.log(`${text.bad('✗ invalid')}: ${text.em(displayName)}`);

	const errors = filterStructuralErrors(
		aggregateBranchExpectations(
			suppressNonMatchingBranchErrors(validate.errors ?? [], validate.schema as AnySchemaObject)
		)
	);

	// Deduplicate by the rendered line: identical messages (e.g. the same required/structural
	// error emitted once per union branch) collapse, while distinct ones are all reported.
	const seen = new Set<string>();
	for (let i = 0; i < errors.length; i++) {
		const path = formatInstancePath(errors[i].instancePath, parsed);
		const line = `  ${text.em(path)}: ${formatError(errors[i])}`;
		if (!seen.has(line)) {
			seen.add(line);
			console.log(line);
		}
	}

	return false;
}

// --- AJV error presentation ------------------------------------------------------------------
// Turns AJV's raw, `allErrors` output into the concise messages checkParsed prints. The pipeline
// is: suppressNonMatchingBranchErrors -> aggregateBranchExpectations -> filterStructuralErrors,
// then formatError / formatInstancePath render each surviving error.

// The field that discriminates an input's anyOf union (_inputs.*.type — text, markdown, …).
const DISCRIMINATOR = 'type';
// Guards both `$ref` resolution and the recursion into a chosen branch's own nested unions.
const MAX_BRANCH_DEPTH = 5;

// A separate AJV instance for re-validating individual union branches. Compiled branch
// validators are cached by branch-schema object, since the same branch is reused across
// every instance that hits the union (e.g. one validator per input type for all _inputs).
const branchAjv = new Ajv({ strict: false, allErrors: true, verbose: true });
const branchValidators = new WeakMap<object, ValidateFunction | null>();

// With `allErrors`, AJV reports failures from every branch of an anyOf/oneOf — including
// branches the data never targeted (e.g. a `markdown` input collecting errors from the
// `number` and `color` branches). Inputs are discriminated by their `type`, so for each failing
// input union we re-validate the data against only the branch whose `type` matches and replace
// the union's noisy errors with that branch's real errors. Non-input unions (and inputs whose
// `type` matches no branch) are left untouched — see isInputUnion / matchedBranchErrors.
function suppressNonMatchingBranchErrors(
	errors: ErrorObject[],
	rootSchema: AnySchemaObject,
	depth = 0
): ErrorObject[] {
	if (depth > MAX_BRANCH_DEPTH) {
		return errors;
	}

	// Group the union (anyOf/oneOf) errors by the instance location they apply to.
	const unionsByPath = new Map<string, ErrorObject[]>();
	for (const error of errors) {
		if (error.keyword === 'anyOf' || error.keyword === 'oneOf') {
			const existing = unionsByPath.get(error.instancePath);
			if (existing) {
				existing.push(error);
			} else {
				unionsByPath.set(error.instancePath, [error]);
			}
		}
	}

	const replacements: Array<{ path: string; errors: ErrorObject[] }> = [];

	// Process outer unions before nested ones so a replaced subtree's inner unions are handled
	// by the recursion below rather than against the (about to be discarded) original errors.
	const paths = Array.from(unionsByPath.keys()).sort((a, b) => a.length - b.length);
	for (const path of paths) {
		if (replacements.some((r) => r.path !== path && isUnderPath(path, r.path))) {
			continue;
		}

		// Prefer the most specific (deepest) union reported at this location.
		const unions = unionsByPath.get(path) ?? [];
		unions.sort((a, b) => b.schemaPath.length - a.schemaPath.length);

		for (const union of unions) {
			const branchErrors = matchedBranchErrors(union, rootSchema);
			if (!branchErrors) {
				continue;
			}

			const rebased = branchErrors.map((error) => ({
				...error,
				instancePath: path + error.instancePath,
			}));
			replacements.push({
				path,
				errors: suppressNonMatchingBranchErrors(rebased, rootSchema, depth + 1),
			});
			break;
		}
	}

	if (replacements.length === 0) {
		return errors;
	}

	const kept = errors.filter(
		(error) => !replacements.some((r) => isUnderPath(error.instancePath, r.path))
	);
	return [...kept, ...replacements.flatMap((r) => r.errors)];
}

function isUnderPath(path: string, base: string): boolean {
	return path === base || path.startsWith(`${base}/`);
}

// Inputs are the only `type`-discriminated union in CloudCannon's schemas, so the suppression is
// scoped to input positions: an entry in an `_inputs` map (top-level or nested under a structure),
// or a top-level entry of a standalone inputs file (which is itself an `_inputs` map). This keeps
// the discriminator logic from ever acting on an unrelated `type` field elsewhere in a config.
function isInputUnion(instancePath: string, rootSchema: AnySchemaObject): boolean {
	const parent = instancePath.slice(0, instancePath.lastIndexOf('/'));
	if (parent.endsWith('/_inputs')) {
		return true;
	}

	return rootSchema.$id === inputsSchema.$id && instancePath.lastIndexOf('/') === 0;
}

// If `union` is a discriminated input union whose `type` matches a branch (and at least one other
// branch rejects it), re-validates the data against the matching branch(es) and returns their
// errors. Returns undefined when the union isn't an input, isn't discriminated, nothing matches,
// or a branch can't be re-validated — in which case the caller leaves the original errors in place.
function matchedBranchErrors(
	union: ErrorObject,
	rootSchema: AnySchemaObject
): ErrorObject[] | undefined {
	if (!isInputUnion(union.instancePath, rootSchema)) {
		return undefined;
	}

	const branches = union.parentSchema?.[union.keyword];
	const data = union.data;
	if (!Array.isArray(branches) || !data || typeof data !== 'object') {
		return undefined;
	}

	const actual = (data as Record<string, unknown>)[DISCRIMINATOR];
	if (actual === undefined) {
		return undefined;
	}

	let discriminated = 0;
	const matched: AnySchemaObject[] = [];
	for (const branch of branches) {
		const allowed = branchDiscriminatorValues(branch, rootSchema);
		if (!allowed) {
			continue;
		}
		discriminated += 1;
		if (allowed.includes(actual)) {
			matched.push(branch);
		}
	}

	// Only suppress when this really is a discriminated union: something matched, and at least
	// one other discriminated branch didn't (otherwise there's no cross-branch noise to remove).
	if (matched.length === 0 || discriminated <= matched.length) {
		return undefined;
	}

	const result: ErrorObject[] = [];
	for (const branch of matched) {
		const branchErrors = revalidateBranch(data, branch, rootSchema);
		if (!branchErrors) {
			return undefined;
		}
		result.push(...branchErrors);
	}
	return result;
}

// The `type` values a branch accepts (following a single `$ref`), or undefined if the branch
// doesn't pin `type` with a const/enum and therefore isn't part of the discrimination.
function branchDiscriminatorValues(
	branch: unknown,
	rootSchema: AnySchemaObject
): unknown[] | undefined {
	const type = resolveRef(branch, rootSchema)?.properties?.[DISCRIMINATOR];

	if (!type || typeof type !== 'object') {
		return undefined;
	}

	if ('const' in type) {
		return [type.const];
	}

	return Array.isArray(type.enum) ? type.enum : undefined;
}

function resolveRef(
	schema: unknown,
	rootSchema: AnySchemaObject,
	depth = 0
): AnySchemaObject | undefined {
	if (schema && typeof schema === 'object' && depth <= MAX_BRANCH_DEPTH && '$ref' in schema) {
		if (typeof schema.$ref === 'string') {
			const match = schema.$ref.match(/^#\/(definitions|\$defs)\/(.+)$/);
			if (match) {
				const dictionary = (rootSchema as Record<string, AnySchemaObject>)[match[1]];
				return resolveRef(dictionary?.[match[2]], rootSchema, depth + 1);
			}
		}
	}
	return (schema ?? undefined) as AnySchemaObject | undefined;
}

// Re-validates `data` against a single union branch, resolving the branch's `$ref`s via the
// root schema's definitions. Returns its errors, or undefined if the branch can't compile.
function revalidateBranch(
	data: unknown,
	branch: AnySchemaObject,
	rootSchema: AnySchemaObject
): ErrorObject[] | undefined {
	let validate = branchValidators.get(branch);
	if (validate === undefined) {
		try {
			validate = branchAjv.compile({
				allOf: [branch],
				definitions: rootSchema.definitions,
				$defs: rootSchema.$defs,
			});
		} catch {
			validate = null;
		}
		branchValidators.set(branch, validate);
	}

	if (!validate) {
		return undefined;
	}

	validate(data);
	return (validate.errors ?? []).map((error) => ({ ...error }));
}

// When a field fails against multiple oneOf/anyOf branches, AJV reports one error per branch.
// This collapses the duplicates a single field accumulates into one error per kind of mismatch:
// all the const/enum branches merge into one "allowed values: …" list (e.g. _inputs.*.type), and
// all the `type` branches merge into one "instead of string or object" (e.g. options.structures).
function aggregateBranchExpectations(errors: ErrorObject[]): ErrorObject[] {
	const valuesByPath = new Map<string, Set<unknown>>();
	const typesByPath = new Map<string, Set<string>>();

	for (const error of errors) {
		if (error.keyword === 'const') {
			addTo(valuesByPath, error.instancePath, [error.params.allowedValue]);
		} else if (error.keyword === 'enum') {
			addTo(valuesByPath, error.instancePath, error.params.allowedValues);
		} else if (error.keyword === 'type') {
			const type = error.params.type;
			addTo(typesByPath, error.instancePath, Array.isArray(type) ? type : [type]);
		}
	}

	const seen = new Set<string>();
	const result: ErrorObject[] = [];

	for (const error of errors) {
		if (isValueKeyword(error.keyword)) {
			if (!addNew(seen, `value|${error.instancePath}`)) {
				continue;
			}
			// Values whose type is also listed by a `type` branch (e.g. {type: boolean, const: false})
			// are folded into that type's label below, so leave them off the standalone value line.
			const types = typesByPath.get(error.instancePath);
			const allowedValues = Array.from(valuesByPath.get(error.instancePath) ?? []).filter(
				(value) => !types?.has(jsonType(value))
			);
			if (allowedValues.length === 0) {
				continue;
			}
			result.push(
				allowedValues.length === 1 && error.keyword === 'const'
					? error
					: { ...error, keyword: 'enum', params: { allowedValues } }
			);
		} else if (error.keyword === 'type') {
			if (!addNew(seen, `type|${error.instancePath}`)) {
				continue;
			}
			const type = Array.from(typesByPath.get(error.instancePath) ?? []);
			const values = Array.from(valuesByPath.get(error.instancePath) ?? []);
			// Annotate a type with the literal value(s) it's pinned to, so {type: boolean, const: false}
			// reads as "boolean (false)" rather than the looser bare "boolean".
			const literalsByType: Record<string, unknown[]> = {};
			for (const name of type) {
				const literals = values.filter((value) => jsonType(value) === name);
				if (literals.length > 0) {
					literalsByType[name] = literals;
				}
			}
			result.push({
				...error,
				params: { ...error.params, type: type.length === 1 ? type[0] : type, literalsByType },
			});
		} else {
			result.push(error);
		}
	}

	return result;
}

function isValueKeyword(keyword: string): boolean {
	return keyword === 'const' || keyword === 'enum';
}

// The JSON Schema type name for a runtime value, matching how `type` errors name the actual type.
function jsonType(value: unknown): string {
	return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
}

function isStructuralKeyword(keyword: string): boolean {
	return keyword === 'oneOf' || keyword === 'anyOf' || keyword === 'additionalProperties';
}

// Trims redundant union noise. At an anyOf/oneOf location AJV reports both an umbrella "no branch
// matched" error and each branch's own complaint; this drops:
//   - the umbrella when a concrete error already explains the failure at that path or deeper, and
//   - a losing branch's "wrong type" error when the value actually matched another branch and
//     failed deeper inside it (e.g. an object given to a string|object union that fails within the
//     object — reporting "allowed types: string" there would wrongly imply an object is invalid).
function filterStructuralErrors(errors: ErrorObject[]): ErrorObject[] {
	const compositionPaths = new Set<string>();
	const nonStructuralPaths: string[] = [];

	for (const error of errors) {
		if (error.keyword === 'oneOf' || error.keyword === 'anyOf') {
			compositionPaths.add(error.instancePath);
		}

		if (!isStructuralKeyword(error.keyword)) {
			nonStructuralPaths.push(error.instancePath);
		}
	}

	const hasDeeperError = (path: string): boolean =>
		nonStructuralPaths.some((p) => p.startsWith(`${path}/`));
	const hasSameOrDeeperError = (path: string): boolean =>
		hasDeeperError(path) || nonStructuralPaths.includes(path);

	return errors.filter((error) => {
		if (!compositionPaths.has(error.instancePath)) {
			return true;
		}

		if (isStructuralKeyword(error.keyword)) {
			return !hasSameOrDeeperError(error.instancePath);
		}

		if (error.keyword === 'type') {
			return !hasDeeperError(error.instancePath);
		}

		return true;
	});
}

function addNew(set: Set<string>, key: string): boolean {
	if (set.has(key)) {
		return false;
	}

	set.add(key);
	return true;
}

function addTo<T>(map: Map<string, Set<T>>, key: string, values: Iterable<T>): void {
	let set = map.get(key);
	if (!set) {
		set = new Set();
		map.set(key, set);
	}

	for (const value of values) {
		set.add(value);
	}
}

function highlight(v: unknown): string {
	return text.value(String(v));
}

function formatError(error: ErrorObject): string {
	switch (error.keyword) {
		case 'const':
			return `value ${highlight(error.data)} should be ${highlight(error.params.allowedValue)}`;
		case 'additionalProperties':
			return `unexpected property ${highlight(error.params.additionalProperty)}`;
		case 'required':
			return `must have required property ${highlight(error.params.missingProperty)}`;
		case 'enum': {
			const visibleValues = 20;
			const allowedValues: unknown[] = error.params.allowedValues;

			// Too many to list usefully (e.g. the ~3500 icon names): show the count, and point at the
			// nearest match so the user has something actionable rather than a truncated dump.
			if (allowedValues.length > visibleValues) {
				const candidates = allowedValues.filter(
					(value): value is string => typeof value === 'string'
				);
				const match =
					typeof error.data === 'string' && candidates.length > 0
						? ` (closest: ${highlight(closest(error.data, candidates))})`
						: '';
				return `unexpected value ${highlight(error.data)}, allowed values: ${allowedValues.length} values${match}`;
			}

			const shown = allowedValues.map(highlight).join(', ');
			return `unexpected value ${highlight(error.data)}, allowed values: ${shown}`;
		}
		case 'type': {
			const types = Array.isArray(error.params.type) ? error.params.type : [error.params.type];
			const literalsByType: Record<string, unknown[]> = error.params.literalsByType ?? {};
			const allowed = types
				.map((name: string) => {
					const literals = literalsByType[name];
					return literals?.length
						? `${highlight(name)} (${literals.map(highlight).join(', ')})`
						: highlight(name);
				})
				.join(', ');

			return `unexpected type ${highlight(jsonType(error.data))}, allowed types: ${allowed}`;
		}
		case 'anyOf':
			return 'does not match any of the allowed formats';
		case 'oneOf':
			return 'must match exactly one of the allowed formats';
		case 'pattern':
			return `does not match pattern ${highlight(error.params.pattern)}`;
		case 'format':
			return `not a valid ${highlight(error.params.format)}`;
		case 'propertyNames':
			return `invalid property name ${highlight(error.params.propertyName)}`;
		case 'uniqueItems':
			return 'must not contain duplicate items';
		case 'not':
			return 'must not match the disallowed format';
		case 'minimum':
		case 'maximum':
		case 'exclusiveMinimum':
		case 'exclusiveMaximum': {
			const comparisons: Record<string, string> = {
				'>=': 'at least',
				'<=': 'at most',
				'>': 'greater than',
				'<': 'less than',
			};
			const comparison = comparisons[error.params.comparison] ?? error.params.comparison;
			return `must be ${comparison} ${highlight(error.params.limit)}`;
		}
		default:
			return error.message ?? 'unknown error';
	}
}

// Renders an AJV instancePath as a JS-style accessor. Walks the parsed data so a numeric segment
// only becomes a bracketed index when it actually indexes an array — a numeric object key (e.g.
// {"0": …}) stays a dotted key: "/values/1/_inputs" -> "$.values[1]._inputs".
function formatInstancePath(instancePath: string, data: unknown): string {
	let result = '$';
	let current = data;

	for (const segment of instancePath.split('/').slice(1)) {
		// instancePath is a JSON Pointer: ~1 is an escaped "/" and ~0 an escaped "~" within a key.
		const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
		result += Array.isArray(current) ? `[${key}]` : `.${key}`;
		current =
			current && typeof current === 'object'
				? (current as Record<string, unknown>)[key]
				: undefined;
	}

	return result;
}
