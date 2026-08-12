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

export function handleAPIError(err: unknown): void {
	if (err instanceof AuthenticationError) {
		console.error(
			text.bad(`Failed to authenticate with the CloudCannon API while requesting ${err.url}`)
		);

		const details: { authHeaders: Record<string, string>; errors?: unknown; options?: unknown } = {
			authHeaders: err.authHeaders,
		};

		if (err.errors) {
			details.errors = err.errors;
		}

		if (err.options) {
			details.options = err.options;
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
			details.options = err.options;
		}

		printErrorJson(details);
	} else {
		throw err;
	}
}

export function validateUserAccessKey(accessKey: UserAccessKey): boolean {
	if (!/ccu_[a-zA-z0-9=_-]{24}/.test(accessKey.id)) {
		console.error("Error: Access key id is invalid. Please check it's correct and try again.");
		return false;
	}

	if (!/[a-zA-z0-9=+/]{32}/.test(accessKey.secret)) {
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
		console.log(
			`You must log in to run this command. Either run ${text.em('cloudcannon login')} to authorize with your CloudCannon account, or provide an API key through the CLOUDCANNON_API_KEY environment variable.`
		);
		process.exit(1);
	}

	if (typeof process.env.CLOUDCANNON_API_ORIGIN === 'string') {
		options.apiOrigin = process.env.CLOUDCANNON_API_ORIGIN;
	}

	return new CloudCannonClient(options);
}
