const VALID_EDITORS = new Set(['visual', 'content', 'data', 'source', 'preview']);
const EDITOR_ALIASES: Record<string, string> = {
	explore: 'content',
	update: 'visual',
	browser: 'source',
	code: 'source',
};

const FILE_PREFIXES = new Set(['collections', 'content', 'data']);
const LEGACY_PREFIXES = new Set(['explore', 'browser', 'update', 'source']);
const DEAD_PREFIXES = new Set(['visual', 'preview']);
const APP_ROUTE_PREFIXES = new Set([
	'dashboard',
	'settings',
	'status',
	'setup',
	'usage',
	'reports',
	'debug',
	'publish',
	'inbox',
	'assets',
]);

export interface CollectionInfo {
	key: string;
	path?: string;
	schemas: string[];
	enabledEditors?: string[];
}

export interface LinkContext {
	collections: Map<string, CollectionInfo>;
	source: string;
	fileExists: (repoPath: string) => boolean;
}

export type FindingLevel = 'error' | 'warning' | 'info';

export interface LinkFinding {
	level: FindingLevel;
	message: string;
}

function decodeEntities(value: string): string {
	let previous: string;
	let result = value;
	do {
		previous = result;
		result = result
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'");
	} while (result !== previous);
	return result;
}

function findBodyEnd(value: string, bodyStart: number, precedingChar: string): number {
	if (precedingChar === '"' || precedingChar === "'") {
		const close = value.indexOf(precedingChar, bodyStart);
		return close === -1 ? value.length : close;
	}

	if (precedingChar === '<') {
		for (let i = bodyStart; i < value.length; i++) {
			if (value[i] === '>' || /\s/.test(value[i])) {
				return i;
			}
		}
		return value.length;
	}

	if (precedingChar === '(') {
		let depth = 0;
		for (let i = bodyStart; i < value.length; i++) {
			const c = value[i];
			if (/\s/.test(c)) {
				return i;
			}
			if (c === '(') {
				depth++;
			} else if (c === ')') {
				if (depth === 0) {
					return i;
				}
				depth--;
			}
		}
		return value.length;
	}

	for (let i = bodyStart; i < value.length; i++) {
		if (/\s/.test(value[i]) || value[i] === '>') {
			return i;
		}
	}
	return value.length;
}

function trimTrailing(link: string): string {
	let end = link.length;
	while (end > 0) {
		const c = link[end - 1];
		if ('.,;:!?'.includes(c)) {
			end--;
			continue;
		}
		if (c === ')' || c === ']') {
			const open = c === ')' ? '(' : '[';
			const body = link.slice(0, end);
			let opens = 0;
			let closes = 0;
			for (const ch of body) {
				if (ch === open) opens++;
				else if (ch === c) closes++;
			}
			if (closes > opens) {
				end--;
				continue;
			}
		}
		break;
	}
	return link.slice(0, end);
}

export function extractEditorLinks(value: string): string[] {
	if (typeof value !== 'string' || !/cloudcannon:/i.test(value)) {
		return [];
	}

	const results: string[] = [];
	const scheme = /(?<![A-Za-z0-9])cloudcannon:/gi;
	let match: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec iteration.
	while ((match = scheme.exec(value)) !== null) {
		const bodyStart = match.index + match[0].length;
		const end = findBodyEnd(value, bodyStart, match.index > 0 ? value[match.index - 1] : '');
		const link = trimTrailing(`cloudcannon:${value.slice(bodyStart, end)}`);
		if (link.length > 'cloudcannon:'.length) {
			results.push(link);
		}
		scheme.lastIndex = end;
	}

	return results;
}

function stripLeadingSlash(value: string): string {
	return value.replace(/^\/+/, '');
}

function decodeCollectionKey(value: string): string {
	return value.replace(/–/g, '/');
}

function safeDecode(value: string): string {
	try {
		return decodeURIComponent(value.replace(/\+/g, ' '));
	} catch {
		return value;
	}
}

function parseQuery(query: string): Record<string, string> {
	const params: Record<string, string> = {};
	for (const pair of query.split('&')) {
		if (!pair) {
			continue;
		}
		const eq = pair.indexOf('=');
		const key = safeDecode(eq === -1 ? pair : pair.slice(0, eq));
		params[key] = safeDecode(eq === -1 ? '' : pair.slice(eq + 1));
	}
	return params;
}

function resolveEditRoute(
	route: string,
	editorPart: string,
	mainFragment: string,
	ctx: LinkContext
): LinkFinding | undefined {
	const [, query = ''] = editorPart.split('?');
	const params = parseQuery(query);

	const mainKey = stripLeadingSlash(mainFragment).split('/').slice(1).join('/');
	const collectionKey = decodeCollectionKey(params.collection || mainKey);
	const collection = collectionKey ? ctx.collections.get(collectionKey) : undefined;

	if (collectionKey && !collection) {
		return {
			level: 'error',
			message: `unknown collection ${q(collectionKey)} (not defined in collections_config)`,
		};
	}

	if (!params.path) {
		if (route === 'create' || params.schema || params.base_path || params.default_content_file) {
			return undefined;
		}
		return {
			level: 'warning',
			message: 'edit link has no path parameter, so its target file cannot be verified',
		};
	}

	if (!ctx.fileExists(params.path)) {
		return { level: 'error', message: `file not found: ${q(params.path)}` };
	}

	if (params.schema && collection && collection.schemas.length > 0) {
		if (!collection.schemas.includes(params.schema)) {
			return {
				level: 'error',
				message: `unknown schema ${q(params.schema)} for collection ${q(collection.key)} (available: ${collection.schemas.map(q).join(', ')})`,
			};
		}
	}

	if (params.editor) {
		const editor = EDITOR_ALIASES[params.editor] ?? params.editor;
		if (!VALID_EDITORS.has(editor)) {
			return {
				level: 'error',
				message: `invalid editor ${q(params.editor)} (expected one of ${[...VALID_EDITORS].map(q).join(', ')})`,
			};
		}
		if (collection?.enabledEditors) {
			const enabled = collection.enabledEditors.map((e) => EDITOR_ALIASES[e] ?? e);
			if (!enabled.includes(editor)) {
				return {
					level: 'warning',
					message: `editor ${q(params.editor)} is not in _enabled_editors for collection ${q(collection.key)} (${collection.enabledEditors.map(q).join(', ')})`,
				};
			}
		}
		if (EDITOR_ALIASES[params.editor]) {
			return {
				level: 'info',
				message: `editor ${q(params.editor)} is a legacy alias; use ${q(editor)}`,
			};
		}
	}

	return undefined;
}

function resolveFileRoute(prefix: string, rest: string, ctx: LinkContext): LinkFinding | undefined {
	if (rest === '') {
		return {
			level: 'error',
			message:
				prefix === 'collections'
					? 'link is missing a collection key or file path'
					: 'link is missing a file path',
		};
	}

	if (prefix === 'collections' && !rest.includes('/')) {
		const collection = ctx.collections.get(decodeCollectionKey(rest));
		if (collection?.path) {
			return undefined;
		}
	}

	if (ctx.fileExists(rest)) {
		return undefined;
	}

	if (prefix === 'collections') {
		const firstSegment = decodeCollectionKey(rest.split('/')[0]);
		if (ctx.collections.has(firstSegment)) {
			return {
				level: 'error',
				message: `${q(firstSegment)} is a collection, but ${q(rest)} is not a file in your repository. Editor links resolve the path as a real repository path, not relative to the collection — use the real path, or the ${q(`collections/${firstSegment}:/edit?path=/…`)} form`,
			};
		}
		return {
			level: 'error',
			message: `no collection named ${q(rest)} and no file at that path`,
		};
	}

	return { level: 'error', message: `no file at ${q(rest)}` };
}

function q(value: string): string {
	return `"${value}"`;
}

function hasPlaceholder(body: string): boolean {
	return /:source\b|:collections_dir\b|:base_path|:extension\b|:editor\b|\[[^\]]*\]|\{/.test(body);
}

export function resolveEditorLink(rawLink: string, ctx: LinkContext): LinkFinding | undefined {
	if (!rawLink.startsWith('cloudcannon:')) {
		return undefined;
	}

	let body = decodeEntities(rawLink.slice('cloudcannon:'.length));

	if (body === '' || body.startsWith('#') || body.startsWith('!')) {
		return undefined;
	}

	body = stripLeadingSlash(body);

	if (body === '' || hasPlaceholder(body)) {
		return undefined;
	}

	const bareRoute = body.match(/^(edit|create)(\?|$)/);
	if (bareRoute) {
		return resolveEditRoute(bareRoute[1], body, '', ctx);
	}

	const splitIndex = body.indexOf(':');
	if (splitIndex !== -1) {
		const editorPart = body.slice(splitIndex + 1);
		const routeMatch = editorPart.match(/^\/?(edit|create)(\?|$)/);
		if (routeMatch) {
			return resolveEditRoute(routeMatch[1], editorPart, body.slice(0, splitIndex), ctx);
		}
	}

	const prefix = body.split('/')[0];

	if (FILE_PREFIXES.has(prefix)) {
		return resolveFileRoute(prefix, body.split('/').slice(1).join('/'), ctx);
	}

	if (DEAD_PREFIXES.has(prefix)) {
		return {
			level: 'error',
			message: `${q(`${prefix}/…`)} is not a valid editor-link route (the app cannot open it)`,
		};
	}

	if (LEGACY_PREFIXES.has(prefix)) {
		return {
			level: 'info',
			message: `${q(`${prefix}/…`)} is a legacy editor-route prefix; prefer the ${q('collections/<key>:/edit?path=/…')} form`,
		};
	}

	if (APP_ROUTE_PREFIXES.has(prefix)) {
		return undefined;
	}

	return {
		level: 'warning',
		message: `unrecognised editor link route ${q(body)} — could not verify`,
	};
}
