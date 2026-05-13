import CloudCannonClient, { type CloudCannonClientConfig } from '@cloudcannon/sdk';

export function getSdkClient(): CloudCannonClient {
	const apiKey = process.env.CLOUDCANNON_API_KEY;
	if (!apiKey) {
		throw new Error(
			'CLOUDCANNON_API_KEY environment variable is required. Set it with: export CLOUDCANNON_API_KEY=your_key'
		);
	}
	const options: CloudCannonClientConfig = { key: apiKey };
	if (typeof process.env.CLOUDCANNON_API_ORIGIN === 'string') {
		options.apiOrigin = process.env.CLOUDCANNON_API_ORIGIN;
	}
	return new CloudCannonClient(options);
}
