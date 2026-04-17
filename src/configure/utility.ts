import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { styleText } from 'node:util';
import type { SsgKey } from '@cloudcannon/configuration-types';
import { ssgs } from '@cloudcannon/gadget';
import { stringify as stringifyYaml } from 'yaml';

export type Mode = 'hosted' | 'headless';
export type Format = 'yaml' | 'json';

const ssgValues = Object.values(ssgs);

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

export const checkSsg = (value: unknown | undefined): SsgKey | undefined => {
	return typeof value === 'string' && Object.hasOwn(ssgs, value) ? (value as SsgKey) : undefined;
};

export const checkMode = (value: string | undefined): Mode | undefined => {
	return value === 'hosted' || value === 'headless' ? value : undefined;
};

export const checkFormat = (value: string | undefined): Format | undefined => {
	return value === 'json' || value === 'yaml' ? value : undefined;
};

export const DEFAULT_MODE: Mode = 'hosted' as const;
export const DEFAULT_FORMAT: Format = 'yaml' as const;

export function extensionFromFormat(format: Format | undefined): 'json' | 'yml' {
	return format === 'json' ? 'json' : 'yml';
}

export const pathArg = {
	path: {
		type: 'positional',
		description: 'The path to your site files',
		default: '.',
		required: false,
	},
} as const;

export const ssgArg = {
	ssg: {
		type: 'string',
		description: 'Override SSG detection',
		valueHint: 'name',
	},
} as const;

export const sourceArg = {
	source: {
		type: 'string',
		description: 'Override source folder',
		valueHint: 'path',
	},
} as const;

export const modeArg = {
	mode: {
		type: 'string',
		description: 'Mode for initial-site-settings',
		default: DEFAULT_MODE,
		valueHint: 'hosted|headless',
	},
} as const;
