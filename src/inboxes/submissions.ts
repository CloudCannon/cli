import type { ListInboxSubmissionsOptions } from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { printJson } from '../configure/utility.ts';
import { buildListOptions, listFlagDefs } from '../list-options.ts';
import { getSdkClient } from '../sdk-client.ts';
import { resolveInboxUuid } from './resolve.ts';

export const inboxesSubmissionsListCommand = defineCommand({
	meta: {
		name: 'list',
		description: 'List submissions for an inbox.',
	},
	args: {
		inbox: {
			type: 'string',
			description: 'The inbox name, ID, key, or UUID',
			valueHint: 'name|id|key|uuid',
			required: true,
		},
		...listFlagDefs,
	},
	async run(ctx): Promise<void> {
		const client = getSdkClient();
		const inboxUuid = await resolveInboxUuid(client, ctx.args.inbox);
		if (!inboxUuid) {
			process.exitCode = 1;
			return;
		}
		const inboxClient = client.inbox(inboxUuid);
		const options = buildListOptions(ctx.args);
		const submissions = await inboxClient.getSubmissions(options as ListInboxSubmissionsOptions);
		printJson({
			current_page: submissions.current_page,
			total_pages: submissions.total_pages,
			total_items: submissions.total_items,
			items: submissions.items,
		});
	},
});

export const inboxesSubmissionsCommand = defineCommand({
	meta: {
		name: 'submissions',
		description: 'Manage submissions for an inbox.',
	},
	subCommands: {
		list: inboxesSubmissionsListCommand,
	},
});
