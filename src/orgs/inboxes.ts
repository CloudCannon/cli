import type { ListOrgInboxesOptions } from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { printJson } from '../configure/utility.ts';
import { buildListOptions, listFlagDefs } from '../list-options.ts';
import { getSdkClient } from '../sdk-client.ts';
import { resolveOrgUuid } from './resolve.ts';

export const orgsInboxesListCommand = defineCommand({
	meta: {
		name: 'list',
		description: 'List all inboxes for an organisation.',
	},
	args: {
		org: {
			type: 'string',
			description: 'The organisation name, ID, or UUID',
			valueHint: 'name|id|uuid',
			required: true,
		},
		...listFlagDefs,
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const orgUuid = await resolveOrgUuid(client, ctx.args.org);
		if (!orgUuid) {
			process.exitCode = 1;
			return;
		}
		const org = client.org(orgUuid);
		const options = buildListOptions(ctx.args);
		const inboxes = await org.getInboxes(options as ListOrgInboxesOptions);
		printJson({
			current_page: inboxes.current_page,
			total_pages: inboxes.total_pages,
			total_items: inboxes.total_items,
			items: inboxes.items,
		});
	},
});

export const orgsInboxesCommand = defineCommand({
	meta: {
		name: 'inboxes',
		description: 'Manage inboxes for an organisation.',
	},
	subCommands: {
		list: orgsInboxesListCommand,
	},
});
