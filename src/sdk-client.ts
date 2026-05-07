import CloudCannonClient from '@cloudcannon/sdk';

export function getSdkClient(): CloudCannonClient {
	const apiKey = process.env.CLOUDCANNON_API_KEY;
	if (!apiKey) {
		throw new Error(
			'CLOUDCANNON_API_KEY environment variable is required. Set it with: export CLOUDCANNON_API_KEY=your_key'
		);
	}
	return new CloudCannonClient({ key: apiKey });
}
