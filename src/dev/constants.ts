import { fileURLToPath } from 'node:url';

const DEV_SERVER_ORIGIN: string = process.env.DEV_SERVER_ORIGIN ?? 'https://cdn.cloudcannon.com';
const DEV_SERVER_ENTRYPOINT: string | undefined = process.env.DEV_SERVER_ENTRYPOINT;
const DEV_SERVER_SHARED_ENTRYPOINT: string | undefined = process.env.DEV_SERVER_SHARED_ENTRYPOINT;
const DEV_SERVER_STYLES_ENTRYPOINT: string | undefined = process.env.DEV_SERVER_STYLES_ENTRYPOINT;

const DEV_SERVER_PREFIX: string =
	process.env.DEV_SERVER_PREFIX ??
	(process.env.USE_BETA_ASSETS ? '/staging-dev-server' : '/production-dev-server');

const DEV_SERVER_MANIFEST_URL: string = `${DEV_SERVER_ORIGIN}/manifests/${DEV_SERVER_PREFIX.replace(/^\//, '')}.json`;

let manifest: Promise<{ [key: string]: string }> | undefined;
async function getDevServerManifest(): Promise<{ [key: string]: string }> {
	if (!manifest) {
		manifest = (async () => {
			const response = await fetch(DEV_SERVER_MANIFEST_URL);
			if (!response.ok) {
				throw new Error(`Request failed with status ${response.status}`);
			}
			return response.json() as Promise<{ [key: string]: string }>;
		})();
	}
	return manifest;
}

async function resolveEntrypoint(entrypoint: string): Promise<string> {
	const manifest = await getDevServerManifest();
	const url = manifest[entrypoint];
	if (!url) {
		throw new Error(`Failed to resolve entrypoint ${entrypoint} in the dev-server manifest`);
	}
	return `${DEV_SERVER_ORIGIN}/${url}`;
}

const TEMPLATE_SUBSTITUTIONS: Readonly<Record<string, () => Promise<string>>> = {
	'{{ DEV_SERVER_ENTRYPOINT }}': async () =>
		DEV_SERVER_ENTRYPOINT
			? `${DEV_SERVER_ORIGIN}${DEV_SERVER_PREFIX}${DEV_SERVER_ENTRYPOINT}`
			: resolveEntrypoint('site-router-embed'),
	'{{ DEV_SERVER_SHARED_ENTRYPOINT }}': async () =>
		DEV_SERVER_SHARED_ENTRYPOINT
			? `${DEV_SERVER_ORIGIN}${DEV_SERVER_PREFIX}${DEV_SERVER_SHARED_ENTRYPOINT}`
			: resolveEntrypoint('shared'),
	'{{ DEV_SERVER_STYLES_ENTRYPOINT }}': async () =>
		DEV_SERVER_STYLES_ENTRYPOINT
			? `${DEV_SERVER_ORIGIN}${DEV_SERVER_PREFIX}${DEV_SERVER_STYLES_ENTRYPOINT}`
			: resolveEntrypoint('redesign'),
};

const TEMPLATES_DIR = fileURLToPath(new URL('../templates/', import.meta.url));

export { TEMPLATE_SUBSTITUTIONS, TEMPLATES_DIR };
