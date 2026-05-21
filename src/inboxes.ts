import { defineCommand } from 'citty';
import { inboxesSubmissionsCommand } from './inboxes/submissions.ts';

export const inboxesCommand = defineCommand({
	meta: {
		name: 'inboxes',
		description: 'Manage CloudCannon inboxes.',
	},
	subCommands: {
		submissions: inboxesSubmissionsCommand,
	},
});
