import type { ListInboxSubmissionsOptions } from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { printJson } from '../configure/utility.ts';
import { listFlagDefs, parseListOptions } from '../list-options.ts';
import { getSdkClient, handleAPIError } from '../sdk-client.ts';
import { inboxArg, resolveInboxUuid } from './resolve.ts';

export const inboxesSubmissionsListCommand = defineCommand({
	meta: {
		name: 'list',
		description: 'List submissions for an inbox.',
	},
	args: {
		...inboxArg,
		...listFlagDefs,
	},
	async run(ctx): Promise<void> {
		const options = parseListOptions(ctx.args);
		if (!options) {
			process.exitCode = 1;
			return;
		}
		const client = await getSdkClient();
		const inboxUuid = await resolveInboxUuid(client, ctx.args.inbox);
		if (!inboxUuid) {
			process.exitCode = 1;
			return;
		}
		const inboxClient = client.inbox(inboxUuid);
		try {
			const submissions = await inboxClient.getSubmissions(options as ListInboxSubmissionsOptions);
			printJson({
				current_page: submissions.current_page,
				total_pages: submissions.total_pages,
				total_items: submissions.total_items,
				items: submissions.items,
			});
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
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
