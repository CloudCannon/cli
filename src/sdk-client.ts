import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import CloudCannonClient, {
	type CloudCannonClientConfig,
	type UserAccessKey,
} from '@cloudcannon/sdk';
import { em } from './configure/utility.ts';

let dataDir: string | undefined;

const xdgHome: string | undefined = process.env.XDG_DATA_HOME;
if (xdgHome) {
	dataDir = join(xdgHome, 'cloudcannon');
}

if (!dataDir || !isAbsolute(dataDir)) {
	const home = process.env.HOME;
	if (home) {
		dataDir = join(home, '.local', 'share', 'cloudcannon');
	}

	if (!dataDir || !isAbsolute(dataDir)) {
		dataDir = undefined;
	}
}

if (dataDir) {
	await mkdir(dataDir, { recursive: true });
}

function decodeUserAccessKey(encodedAccessKey: string): UserAccessKey {
	const [encodedId, encodedSecret] = encodedAccessKey.split('#');
	const id = Buffer.from(encodedId, 'base64').toString('utf-8');
	const secret = Buffer.from(encodedSecret, 'base64').toString('utf-8');
	return { id, secret };
}

export async function saveUserAccessKey(encodedAccessKey: string): Promise<void> {
	if (dataDir) {
		await writeFile(
			join(dataDir, 'auth.json'),
			JSON.stringify(decodeUserAccessKey(encodedAccessKey))
		);
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
	if (dataDir) {
		try {
			const data = await readFile(join(dataDir, 'auth.json'), 'utf-8');
			userAccessKey = JSON.parse(data);
		} catch (err) {}
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
