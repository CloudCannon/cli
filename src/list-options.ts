export const listFlagDefs = {
	page: {
		type: 'string',
		description: 'Page number to fetch',
		valueHint: 'n',
	},
	items: {
		type: 'string',
		description: 'Number of items per page',
		valueHint: 'n',
	},
	'sort-by': {
		type: 'string',
		description: 'Field name to sort by',
		valueHint: 'field',
	},
	'sort-direction': {
		type: 'string',
		description: 'Sort direction (ASC or DESC)',
		valueHint: 'ASC|DESC',
	},
	filter: {
		type: 'string',
		description: 'Comma-separated key=value pairs to filter by',
		valueHint: 'key=value,key=value',
	},
} as const;

export type ListArgs = {
	page?: string | number | boolean | string[];
	items?: string | number | boolean | string[];
	sortBy?: string | number | boolean | string[];
	sortDirection?: string | number | boolean | string[];
	filter?: string | number | boolean | string[];
};

export function buildListOptions(args: ListArgs): Record<string, unknown> {
	const options: Record<string, unknown> = {};
	if (args.page !== undefined) {
		options.page = Number(args.page);
	}
	if (args.items !== undefined) {
		options.items = Number(args.items);
	}
	if (args.sortBy !== undefined) {
		options.sort_attribute = String(args.sortBy);
	}
	if (args.sortDirection !== undefined) {
		const dir = String(args.sortDirection).toUpperCase();
		if (dir !== 'ASC' && dir !== 'DESC') {
			throw new Error('--sort-direction must be ASC or DESC.');
		}
		options.sort_direction = dir;
	}
	if (args.filter !== undefined) {
		const filters: Record<string, string> = {};
		for (const pair of String(args.filter).split(',')) {
			const trimmed = pair.trim();
			if (!trimmed) {
				continue;
			}
			const eq = trimmed.indexOf('=');
			if (eq === -1) {
				throw new Error(`--filter entry "${trimmed}" must be in key=value form.`);
			}
			const key = trimmed.slice(0, eq).trim();
			const value = trimmed.slice(eq + 1).trim();
			if (!key) {
				throw new Error(`--filter entry "${trimmed}" must have a key.`);
			}
			filters[key] = value;
		}
		options.filters = filters;
	}
	return options;
}
