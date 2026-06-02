import { text } from '@clack/prompts';
import { defineCommand } from 'citty';
import { exitOnCancel } from './configure/utility.ts';
import { decodeUserAccessKey, saveUserAccessKey } from './sdk-client.ts';

export const loginCommand = defineCommand({
	meta: {
		name: 'login',
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
		const accessKeyId = ctx.args['access-key-id'];
		const accessKeySecret = ctx.args['access-key-secret'];

		if (accessKeyId || accessKeySecret) {
			if (!accessKeyId || !accessKeySecret) {
				console.error(
					'Error: Both --access-key-id and --access-key-secret must be provided together'
				);
				process.exitCode = 1;
				return;
			}

			console.log('Logged in successfully');
			return saveUserAccessKey({ id: accessKeyId, secret: accessKeySecret });
		}

		const encodedUserAccessKey = await text({
			message:
				'Open https://app.cloudcannon.com/cli/login in your web browser to receive your access key and paste it below to log in.',
		});
		exitOnCancel(encodedUserAccessKey);
		return saveUserAccessKey(decodeUserAccessKey(encodedUserAccessKey));
	},
});
