import { defineCommand } from 'citty';
import { deleteUserAccessKey } from './sdk-client.ts';

export const logoutCommand = defineCommand({
	meta: {
		name: 'logout',
	},
	args: {},
	async run(): Promise<void> {
		await deleteUserAccessKey();
		console.log('👋 See ya');
	},
});
