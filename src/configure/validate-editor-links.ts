import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadConfiguration } from '@cloudcannon/configuration-loader';
import { parse as parseYaml } from 'yaml';
import {
	type CollectionInfo,
	extractEditorLinks,
	type FindingLevel,
	type LinkContext,
	type LinkFinding,
	resolveEditorLink,
} from './editor-links.ts';
import { text } from './utility.ts';

const README_PATHS = ['.cloudcannon/README.md', '.cloudcannon/readme.md'];

const IGNORED_DIRS = new Set([
	'node_modules',
	'.git',
	'dist',
	'_site',
	'build',
	'.cache',
	'.next',
	'.svelte-kit',
]);

async function listRepositoryFiles(targetPath: string): Promise<Set<string>> {
	const files = new Set<string>();
	const root = await realpath(targetPath).catch(() => targetPath);
	const visited = new Set<string>([root]);

	async function walk(dir: string, prefix: string): Promise<void> {
		const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
		if (!entries) {
			return;
		}

		for (const entry of entries) {
			const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
			const fullPath = join(dir, entry.name);

			let isDirectory = entry.isDirectory();
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) {
				const stats = await stat(fullPath).catch(() => null);
				if (!stats) {
					continue;
				}
				isDirectory = stats.isDirectory();
				isFile = stats.isFile();
			}

			if (isDirectory) {
				if (IGNORED_DIRS.has(entry.name)) {
					continue;
				}
				const real = await realpath(fullPath).catch(() => fullPath);
				if (!real.startsWith(root) || visited.has(real)) {
					continue;
				}
				visited.add(real);
				await walk(fullPath, relativePath);
			} else if (isFile) {
				files.add(relativePath);
			}
		}
	}

	await walk(targetPath, '');
	return files;
}

interface LinkOccurrence {
	location: string;
	link: string;
}

function stripLeadingSlash(value: string): string {
	return value.replace(/^\/+/, '');
}

function buildFileExists(filePaths: Set<string>, source: string) {
	return (repoPath: string): boolean => {
		const stripped = stripLeadingSlash(repoPath);
		if (filePaths.has(stripped)) {
			return true;
		}
		return source ? filePaths.has(`${stripLeadingSlash(source)}/${stripped}`) : false;
	};
}

function buildCollections(config: Record<string, unknown>): Map<string, CollectionInfo> {
	const collections = new Map<string, CollectionInfo>();
	const collectionsConfig = config.collections_config;
	if (!collectionsConfig || typeof collectionsConfig !== 'object') {
		return collections;
	}

	for (const [key, raw] of Object.entries(collectionsConfig as Record<string, unknown>)) {
		const value = (raw ?? {}) as Record<string, unknown>;
		const schemas = value.schemas;
		collections.set(key, {
			key,
			path: typeof value.path === 'string' ? value.path : undefined,
			schemas:
				schemas && typeof schemas === 'object'
					? Object.keys(schemas as Record<string, unknown>)
					: [],
			enabledEditors: Array.isArray(value._enabled_editors)
				? (value._enabled_editors as string[])
				: undefined,
		});
	}

	return collections;
}

function collectFromObject(
	value: unknown,
	path: string,
	origin: string,
	sink: LinkOccurrence[]
): void {
	if (typeof value === 'string') {
		for (const link of extractEditorLinks(value)) {
			sink.push({ location: `${origin}: ${path}`, link });
		}
		return;
	}

	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			collectFromObject(value[i], `${path}[${i}]`, origin, sink);
		}
		return;
	}

	if (value && typeof value === 'object') {
		for (const [key, child] of Object.entries(value)) {
			collectFromObject(child, path ? `${path}.${key}` : key, origin, sink);
		}
	}
}

function collectSchemaPaths(value: unknown, found: Set<string>): void {
	if (Array.isArray(value)) {
		for (const child of value) {
			collectSchemaPaths(child, found);
		}
		return;
	}

	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		const schemas = record.schemas;
		if (schemas && typeof schemas === 'object' && !Array.isArray(schemas)) {
			for (const schema of Object.values(schemas as Record<string, unknown>)) {
				const schemaPath = (schema as Record<string, unknown> | null)?.path;
				if (typeof schemaPath === 'string') {
					found.add(stripLeadingSlash(schemaPath));
				}
			}
		}
		for (const child of Object.values(record)) {
			collectSchemaPaths(child, found);
		}
	}
}

function parseFrontMatter(contents: string): Record<string, unknown> | undefined {
	const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) {
		return undefined;
	}
	try {
		const parsed = parseYaml(match[1]);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
}

async function readFileOrUndefined(filePath: string): Promise<string | undefined> {
	try {
		return await readFile(filePath, 'utf-8');
	} catch {
		return undefined;
	}
}

async function gatherOccurrences(
	targetPath: string,
	config: Record<string, unknown>
): Promise<LinkOccurrence[]> {
	const occurrences: LinkOccurrence[] = [];

	collectFromObject(config, '', 'config', occurrences);

	for (const readmePath of README_PATHS) {
		const contents = await readFileOrUndefined(resolve(targetPath, readmePath));
		if (contents) {
			for (const link of extractEditorLinks(contents)) {
				occurrences.push({ location: readmePath, link });
			}
			break;
		}
	}

	const schemaPaths = new Set<string>();
	collectSchemaPaths(config, schemaPaths);
	for (const schemaPath of schemaPaths) {
		const contents = await readFileOrUndefined(resolve(targetPath, schemaPath));
		const frontMatter = contents ? parseFrontMatter(contents) : undefined;
		if (frontMatter) {
			collectFromObject(frontMatter, '', schemaPath, occurrences);
		}
	}

	return occurrences;
}

export async function validateEditorLinks(
	targetPath: string,
	configPath: string
): Promise<boolean> {
	let findings: Array<LinkOccurrence & LinkFinding>;
	let occurrenceCount: number;
	try {
		const loaded = await loadConfiguration(configPath, {
			parseFile: (contents: string, filePath: string) =>
				filePath.endsWith('.json') ? JSON.parse(contents) : parseYaml(contents),
		});
		const config = loaded.config as Record<string, unknown>;
		const filePaths = await listRepositoryFiles(targetPath);
		const source = typeof config.source === 'string' ? config.source : '';

		const ctx: LinkContext = {
			collections: buildCollections(config),
			source,
			fileExists: buildFileExists(filePaths, source),
		};

		const occurrences = await gatherOccurrences(targetPath, config);
		occurrenceCount = occurrences.length;
		findings = [];
		for (const occurrence of occurrences) {
			const finding = resolveEditorLink(occurrence.link, ctx);
			if (finding) {
				findings.push({ ...occurrence, ...finding });
			}
		}
	} catch (err) {
		console.error(
			`Could not validate editor links: ${err instanceof Error ? err.message : String(err)}`
		);
		return false;
	}

	const counts: Record<FindingLevel, number> = { error: 0, warning: 0, info: 0 };
	for (const finding of findings) {
		counts[finding.level]++;
	}

	if (occurrenceCount === 0) {
		console.log(`${text.good('✓ valid')}: ${text.em('editor links')} (none found)`);
		return true;
	}

	if (findings.length === 0) {
		console.log(`${text.good('✓ valid')}: ${text.em('editor links')} (${occurrenceCount} checked)`);
		return true;
	}

	const marker =
		counts.error > 0
			? text.bad('✗ invalid')
			: counts.warning > 0
				? text.secondary('! warnings')
				: text.secondary('ℹ notices');
	console.log(`${marker}: ${text.em('editor links')} (${occurrenceCount} checked)`);

	for (const finding of findings) {
		const label =
			finding.level === 'error'
				? text.bad('error')
				: finding.level === 'warning'
					? text.secondary('warning')
					: text.secondary('notice');
		console.log(`  ${label} ${text.em(finding.location)}`);
		console.log(`    ${text.value(finding.link)}`);
		console.log(`    ${finding.message}`);
	}

	return counts.error === 0;
}
