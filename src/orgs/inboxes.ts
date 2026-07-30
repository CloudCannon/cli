import type { ListOrgInboxesOptions } from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { printJson } from '../configure/utility.ts';
import { buildListOptions, listFlagDefs } from '../list-options.ts';
import { getSdkClient, handleAPIError } from '../sdk-client.ts';
import { resolveOrg } from './resolve.ts';

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
		},
		...listFlagDefs,
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const org = await resolveOrg(client, ctx.args.org);
		if (!org) {
			process.exitCode = 1;
			return;
		}
		const orgClient = client.org(org.uuid);
		const options = buildListOptions(ctx.args);
		try {
			const inboxes = await orgClient.getInboxes(options as ListOrgInboxesOptions);
			printJson({
				current_page: inboxes.current_page,
				total_pages: inboxes.total_pages,
				total_items: inboxes.total_items,
				items: inboxes.items,
			});
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
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
