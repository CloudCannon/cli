import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import CloudCannonClient, {
	ApiError,
	AuthenticationError,
	type CloudCannonClientConfig,
	type UserAccessKey,
} from '@cloudcannon/sdk';
import pkg from '../package.json' with { type: 'json' };
import { printErrorJson, text } from './configure/utility.ts';

function getWindowsDataDir(): string | undefined {
	if (process.env.LOCALAPPDATA) {
		const path = join(process.env.LOCALAPPDATA, 'cloudcannon');
		if (isAbsolute(path)) {
			return path;
		}
	}
	if (process.env.USERPROFILE) {
		const path = join(process.env.USERPROFILE, 'AppData', 'Local', 'cloudcannon');
		if (isAbsolute(path)) {
			return path;
		}
	}
	return undefined;
}

function getUnixDataDir(): string | undefined {
	if (process.env.XDG_DATA_HOME) {
		const path = join(process.env.XDG_DATA_HOME, 'cloudcannon');
		if (isAbsolute(path)) {
			return path;
		}
	}
	if (process.env.HOME) {
		const path = join(process.env.HOME, '.local', 'share', 'cloudcannon');
		if (isAbsolute(path)) {
			return path;
		}
	}
	return undefined;
}

function getDataDir(): string | undefined {
	if (process.platform === 'win32') {
		return getWindowsDataDir();
	}

	return getUnixDataDir();
}

const dataDir = getDataDir();

if (dataDir) {
	await mkdir(dataDir, { recursive: true });
}

const SENSITIVE_KEY = /api[-_]?key|authorization|secret|password|token/i;

// Only ever applied to what the CLI sent, never to what the API sent back: a 422 names
// the field and explains why, and an agent needs that text to correct itself.
function redact(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(redact);
	}

	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				SENSITIVE_KEY.test(key) ? '[redacted]' : redact(entry),
			])
		);
	}

	return value;
}

export function handleAPIError(err: unknown): void {
	if (err instanceof AuthenticationError) {
		console.error(
			text.bad(`Failed to authenticate with the CloudCannon API while requesting ${err.url}`)
		);

		const details: { authHeaders: Record<string, string>; errors?: unknown; options?: unknown } = {
			authHeaders: redact(err.authHeaders) as Record<string, string>,
		};

		if (err.errors) {
			details.errors = err.errors;
		}

		if (err.options) {
			details.options = redact(err.options);
		}

		printErrorJson(details);

		console.error('This may mean that your credentials are invalid or have been revoked.');
		console.error('Please try logging out and logging in again.');
	} else if (err instanceof ApiError) {
		console.error(
			text.bad(`Encountered an unexpected CloudCannon API error while requesting ${err.url}`)
		);

		const details: { status: number | null; errors?: unknown; options?: unknown } = {
			status: err.status,
		};

		if (err.errors) {
			details.errors = err.errors;
		}

		if (err.options) {
			details.options = redact(err.options);
		}

		printErrorJson(details);

		if (err.status === 403) {
			console.error(
				'A 403 can mean the record does not exist, as well as that your access key cannot reach it.'
			);
		}
	} else {
		throw err;
	}
}

const ACCESS_KEY_ID_PATTERN = /^ccu_[A-Za-z0-9]{36}$/;
const LEGACY_ACCESS_KEY_ID_PATTERN = /^ccu_[A-Za-z0-9_-]{32}$/;
const STRUCTURED_SECRET_PATTERN = /^ccs_[A-Za-z0-9]{36}$/;
const LEGACY_SECRET_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

export function validateUserAccessKey(accessKey: UserAccessKey): boolean {
	if (
		!ACCESS_KEY_ID_PATTERN.test(accessKey.id) &&
		!LEGACY_ACCESS_KEY_ID_PATTERN.test(accessKey.id)
	) {
		console.error("Error: Access key id is invalid. Please check it's correct and try again.");
		return false;
	}

	if (
		!STRUCTURED_SECRET_PATTERN.test(accessKey.secret) &&
		!LEGACY_SECRET_PATTERN.test(accessKey.secret)
	) {
		console.error("Error: Access key secret is invalid. Please check it's correct and try again.");
		return false;
	}

	return true;
}

export function decodeUserAccessKey(encodedAccessKey: string): UserAccessKey | undefined {
	const [encodedId, encodedSecret] = encodedAccessKey.split('#');
	if (!encodedId || !encodedSecret) {
		console.error("Error: Authorization code is invalid. Please check it's correct and try again.");
		return;
	}
	const id = Buffer.from(encodedId, 'base64').toString('utf-8');
	const secret = Buffer.from(encodedSecret, 'base64').toString('utf-8');
	const accessKey = { id, secret };
	if (validateUserAccessKey(accessKey)) {
		return accessKey;
	}
}

export async function saveUserAccessKey(accessKey: UserAccessKey): Promise<void> {
	if (dataDir) {
		await writeFile(join(dataDir, 'auth.json'), JSON.stringify(accessKey));
	} else {
		process.exitCode = 1;
		console.error('Failed to find data directory. Unable to log in');
	}
}

export async function deleteUserAccessKey(): Promise<void> {
	if (dataDir) {
		await rm(join(dataDir, 'auth.json'), { force: true });
	}
}

export async function getSdkClient(): Promise<CloudCannonClient> {
	let userAccessKey: UserAccessKey | undefined;
	if (process.env.CC_ACCESS_KEY_ID && process.env.CC_ACCESS_KEY_SECRET) {
		userAccessKey = { id: process.env.CC_ACCESS_KEY_ID, secret: process.env.CC_ACCESS_KEY_SECRET };
	} else if (dataDir) {
		try {
			const data = await readFile(join(dataDir, 'auth.json'), 'utf-8');
			userAccessKey = JSON.parse(data);
		} catch (err: any) {
			if (err.code !== 'ENOENT') {
				throw err;
			}
		}
	}
	const apiKey = process.env.CLOUDCANNON_API_KEY;
	const client = `cli/${pkg.version}`;
	let options: CloudCannonClientConfig;
	if (userAccessKey) {
		options = { userAccessKey: userAccessKey, client };
	} else if (apiKey) {
		options = { key: apiKey, client };
	} else {
		console.error(
			`You must log in to run this command. Either run ${text.em('cloudcannon login')} to authorize with your CloudCannon account, or provide an API key through the CLOUDCANNON_API_KEY environment variable.`
		);
		process.exit(1);
	}

	if (typeof process.env.CLOUDCANNON_API_ORIGIN === 'string') {
		options.apiOrigin = process.env.CLOUDCANNON_API_ORIGIN;
	}

	return new CloudCannonClient(options);
}
