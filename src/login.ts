import { text } from '@clack/prompts';
import { defineCommand } from 'citty';
import { exitOnCancel } from './configure/utility.ts';
import { saveUserAccessKey } from './sdk-client.ts';

export const loginCommand = defineCommand({
	meta: {
		name: 'login',
	},
	args: {},
	async run(): Promise<void> {
		const userAccessKey = await text({
			message:
				'Open https://dev-app.cloudcannon.com/cli/login in your web browser to receive your access key and paste it below to log in.',
		});
		exitOnCancel(userAccessKey);
		await saveUserAccessKey(userAccessKey);
	},
});
