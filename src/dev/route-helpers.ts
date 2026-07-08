import { join, sep } from 'node:path';

export type UncheckedPath = string | { __brand: 'unchecked_path' };

const HAS_URL_PATTERN = typeof URLPattern !== 'undefined';

export function createRoute(spec: string, fallback: RegExp): URLPattern | RegExp {
	if (!HAS_URL_PATTERN) {
		return fallback;
	}
	return new URLPattern({ pathname: spec });
}

export function execRoute(route: URLPattern | RegExp, url: URL): UncheckedPath | undefined {
	if (HAS_URL_PATTERN && route instanceof URLPattern) {
		const match = route.exec(url);
		return match ? decodeURIComponent(match.pathname.groups[0] ?? '') : undefined;
	}

	if (route instanceof RegExp) {
		const match = route.exec(url.pathname);
		return match ? decodeURIComponent(match[1] ?? '') : undefined;
	}
}

export function testRoute(route: URLPattern | RegExp, url: URL): boolean {
	if (HAS_URL_PATTERN && route instanceof URLPattern) {
		return route.test(url);
	}

	if (route instanceof RegExp) {
		return route.test(url.pathname);
	}

	throw new Error('Unexpected route handler combination');
}

export function checkPath(cwd: string, path: UncheckedPath): string {
	if (typeof path !== 'string') {
		throw new Error('Unexpected use of branded string');
	}

	const resolvedPath = join(cwd, path.replaceAll('/', sep));
	if (resolvedPath !== cwd && !resolvedPath.startsWith(cwd + sep)) {
		throw new Error(`Invalid path: ${path}`);
	}

	return resolvedPath;
}
