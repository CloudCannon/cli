import { defineCommand } from 'citty';
import { printJson } from './configure/utility.ts';
import { buildListOptions, listFlagDefs } from './list-options.ts';
import { orgsSitesCommand } from './orgs/sites.ts';
import { getSdkClient } from './sdk-client.ts';

export const orgsListCommand = defineCommand({
	meta: {
		name: 'list',
		description: 'List all organisations.',
	},
	args: listFlagDefs,
	async run(ctx): Promise<void> {
		const client = getSdkClient();
		const options = buildListOptions(ctx.args);
		const orgs = await client.orgs(options as Parameters<typeof client.orgs>[0]);
		printJson({
			current_page: orgs.current_page,
			total_pages: orgs.total_pages,
			total_items: orgs.total_items,
			items: orgs.items,
		});
	},
});

export const orgsGetCommand = defineCommand({
	meta: {
		name: 'get',
		description: 'Get an organisation by UUID.',
	},
	args: {
		org: {
			type: 'string',
			description: 'The organisation UUID',
			valueHint: 'uuid',
			required: true,
		},
	},
	async run(ctx): Promise<void> {
		const client = getSdkClient();
		const org = await client.org(ctx.args.org).get();
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
	},
});
