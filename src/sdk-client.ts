import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import CloudCannonClient, {
	type CloudCannonClientConfig,
	type UserAccessKey,
} from '@cloudcannon/sdk';
import { em } from './configure/utility.ts';

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

export function decodeUserAccessKey(encodedAccessKey: string): UserAccessKey {
	const [encodedId, encodedSecret] = encodedAccessKey.split('#');
	if (!encodedId || !encodedSecret) {
		throw new Error('Invalid access key format. Expected "base64Id#base64Secret".');
	}
	const id = Buffer.from(encodedId, 'base64').toString('utf-8');
	const secret = Buffer.from(encodedSecret, 'base64').toString('utf-8');
	return { id, secret };
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
	let options: CloudCannonClientConfig;
	if (userAccessKey) {
		options = { userAccessKey: userAccessKey };
	} else if (apiKey) {
		options = { key: apiKey };
	} else {
		console.log(
			`You must log in to run this command. Either run ${em('cloudcannon login')} to authorise with your CloudCannon account, or provide an API key through the CLOUDCANNON_API_KEY environment variable.`
		);
		process.exit(1);
	}

	if (typeof process.env.CLOUDCANNON_API_ORIGIN === 'string') {
		options.apiOrigin = process.env.CLOUDCANNON_API_ORIGIN;
	}

	return new CloudCannonClient(options);
}
