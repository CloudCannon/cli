import { text } from '@clack/prompts';
import { defineCommand } from 'citty';
import { exitOnCancel, text as styleText } from './configure/utility.ts';
import { decodeUserAccessKey, saveUserAccessKey, validateUserAccessKey } from './sdk-client.ts';

export const loginCommand = defineCommand({
	meta: {
		name: 'login',
		description: 'Log in to your CloudCannon account.',
	},
	args: {
		'access-key-id': {
			type: 'string',
			required: false,
		},
		'access-key-secret': {
			type: 'string',
			required: false,
		},
	},
	async run(ctx): Promise<void> {
		if (ctx.rawArgs.length > 0) {
			const invalidArgs = [];

			for (const arg of ctx.rawArgs) {
				const argName = arg.split(' ')[0]?.split('=')[0];
				if (!argName || argName === '--access-key-id' || argName === '--access-key-secret') {
					continue;
				}
				invalidArgs.push(argName);
			}

			if (invalidArgs.length > 0) {
				console.error(`Unrecognized argument(s): ${invalidArgs.join(', ')}`);
				console.error('Supported arguments are --access-key-id and --access-key-secret');
				console.error(styleText.bad('Failed to login'));
				process.exitCode = 1;
				return;
			}

			const accessKeyId = ctx.args['access-key-id'];
			const accessKeySecret = ctx.args['access-key-secret'];

			if (!accessKeyId || !accessKeySecret) {
				console.error('Both --access-key-id and --access-key-secret must be provided together');
				process.exitCode = 1;
				return;
			}

			const userAccessKey = { id: accessKeyId, secret: accessKeySecret };

			if (!validateUserAccessKey(userAccessKey)) {
				console.error(styleText.bad('Failed to login'));
				process.exitCode = 1;
				return;
			}

			await saveUserAccessKey(userAccessKey);

			console.log(styleText.good('Logged in successfully'));
			return;
		}

		const encodedUserAccessKey = await text({
			message:
				'Open https://app.cloudcannon.com/cli/login in your web browser to receive your access key and paste it below to log in.',
		});
		exitOnCancel(encodedUserAccessKey);

		const userAccessKey = decodeUserAccessKey(encodedUserAccessKey);
		if (!userAccessKey) {
			console.error(styleText.bad('Login failed'));
			process.exitCode = 1;
			return;
		}

		await saveUserAccessKey(userAccessKey);

		console.log(styleText.good('Logged in successfully'));
		return;
	},
});
