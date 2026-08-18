import { fileURLToPath } from 'node:url';

const DEV_SERVER_ORIGIN: string = process.env.DEV_SERVER_ORIGIN ?? 'https://cdn.cloudcannon.com';
const DEV_SERVER_ENTRYPOINT: string = process.env.DEV_SERVER_ENTRYPOINT ?? '/site-router-embed.js';
const DEV_SERVER_SHARED_ENTRYPOINT: string =
	process.env.DEV_SERVER_SHARED_ENTRYPOINT ?? '/shared.js';
const DEV_SERVER_STYLES_ENTRYPOINT: string =
	process.env.DEV_SERVER_STYLES_ENTRYPOINT ?? '/redesign.css';

let DEV_SERVER_PREFIX: string | undefined = process.env.DEV_SERVER_PREFIX;

if (!DEV_SERVER_PREFIX && Boolean(process.env.USE_BETA_ASSETS)) {
	DEV_SERVER_PREFIX = '/staging-dev-server';
}
if (!DEV_SERVER_PREFIX) {
	DEV_SERVER_PREFIX = '/production-dev-server';
}

const TEMPLATE_SUBSTITUTIONS: Readonly<Record<string, (host: string, port: number) => string>> = {
	'{{ DEV_SERVER_HOST }}': (host: string, _port: number) => host,
	'{{ DEV_SERVER_PORT }}': (_host: string, port: number) => String(port),
	'{{ DEV_SERVER_ENTRYPOINT }}': () =>
		`${DEV_SERVER_ORIGIN}${DEV_SERVER_PREFIX}${DEV_SERVER_ENTRYPOINT}`,
	'{{ DEV_SERVER_SHARED_ENTRYPOINT }}': () =>
		`${DEV_SERVER_ORIGIN}${DEV_SERVER_PREFIX}${DEV_SERVER_SHARED_ENTRYPOINT}`,
	'{{ DEV_SERVER_STYLES_ENTRYPOINT }}': () =>
		`${DEV_SERVER_ORIGIN}${DEV_SERVER_PREFIX}${DEV_SERVER_STYLES_ENTRYPOINT}`,
};

const TEMPLATES_DIR = fileURLToPath(new URL('../templates/', import.meta.url));

export { TEMPLATE_SUBSTITUTIONS, TEMPLATES_DIR };
