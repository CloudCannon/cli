import { type SsgKey, ssgs } from '@cloudcannon/gadget';

export type Mode = 'hosted' | 'headless';
export type Format = 'yaml' | 'json';

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
