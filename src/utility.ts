import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { styleText } from 'node:util';
import type { CollectionConfig, SsgKey } from '@cloudcannon/configuration-types';
import type { CollectionConfigTree } from '@cloudcannon/gadget';
import { ssgs } from '@cloudcannon/gadget';
import type Ssg from '@cloudcannon/gadget/dist/ssgs/ssg.js';
import { stringify as stringifyYaml } from 'yaml';
import type { Format } from './configure/args.ts';

const ssgValues: Ssg[] = Object.values(ssgs);

export function detectSsg(filePaths: string[]): { ssg: SsgKey; scores: Record<SsgKey, number> } {
	const scores: Record<SsgKey, number> = {
		hugo: 0,
		jekyll: 0,
		eleventy: 0,
		nextjs: 0,
		astro: 0,
		sveltekit: 0,
		bridgetown: 0,
		lume: 0,
		mkdocs: 0,
		docusaurus: 0,
		gatsby: 0,
		hexo: 0,
		nuxtjs: 0,
		sphinx: 0,
		static: 0,
		legacy: 0,
		other: 0,
	};

	for (let i = 0; i < filePaths.length; i++) {
		for (let j = 0; j < ssgValues.length; j++) {
			scores[ssgValues[j].key] += ssgValues[j].getPathScore(filePaths[i]);
		}
	}

	const best = ssgValues.reduce(
		(previous, current) => (scores[previous.key] < scores[current.key] ? current : previous),
		ssgs.other
	);

	return {
		ssg: best.key,
		scores,
	};
}

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

export async function writeFileAndFolder(path: string, content: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content);
}

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

export function stringify(config: Record<string, any>, format: Format): string {
	if (format === 'json') {
		return `${JSON.stringify(config, null, 2)}\n`;
	}

	return stringifyYaml(config, {
		lineWidth: 0,
		singleQuote: true,
		aliasDuplicateObjects: false,
	});
}

export function printJson(data: unknown): void {
	console.log(JSON.stringify(data, null, 2));
}

export function em(text: string): string {
	return styleText(['blue', 'italic'], text);
}

export function success(text: string): string {
	return styleText(['green'], text);
}

export function secondary(text: string): string {
	return styleText(['dim'], text);
}
