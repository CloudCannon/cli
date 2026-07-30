import type { ListOrgsOptions } from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { printJson } from './configure/utility.ts';
import { buildListOptions, listFlagDefs } from './list-options.ts';
import { orgsInboxesCommand } from './orgs/inboxes.ts';
import { resolveOrg } from './orgs/resolve.ts';
import { orgsSitesCommand } from './orgs/sites.ts';
import { getSdkClient, handleAPIError } from './sdk-client.ts';

export const orgsListCommand = defineCommand({
	meta: {
		name: 'list',
		description: 'List all organisations.',
	},
	args: listFlagDefs,
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const options = buildListOptions(ctx.args);
		try {
			const orgs = await client.orgs(options as ListOrgsOptions);
			printJson({
				current_page: orgs.current_page,
				total_pages: orgs.total_pages,
				total_items: orgs.total_items,
				items: orgs.items,
			});
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const orgsGetCommand = defineCommand({
	meta: {
		name: 'get',
		description: 'Get an organisation by name, ID, or UUID.',
	},
	args: {
		org: {
			type: 'string',
			description: 'The organisation name, ID, or UUID',
			valueHint: 'name|id|uuid',
		},
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const org = await resolveOrg(client, ctx.args.org);
		if (!org) {
			process.exitCode = 1;
			return;
		}
		printJson(org);
	},
});

export const orgsCommand = defineCommand({
	meta: {
		name: 'orgs',
		description: 'Manage CloudCannon organisations.',
	},
	subCommands: {
		list: orgsListCommand,
		get: orgsGetCommand,
		sites: orgsSitesCommand,
		inboxes: orgsInboxesCommand,
	},
});
