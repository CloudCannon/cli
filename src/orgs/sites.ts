import { defineCommand } from 'citty';
import { printJson } from '../configure/utility.ts';
import { buildListOptions, listFlagDefs } from '../list-options.ts';
import { getSdkClient } from '../sdk-client.ts';

export const orgsSitesListCommand = defineCommand({
	meta: {
		name: 'list',
		description: 'List all sites for an organisation.',
	},
	args: {
		org: {
			type: 'string',
			description: 'The organisation UUID',
			valueHint: 'uuid',
			required: true,
		},
		...listFlagDefs,
	},
	async run(ctx): Promise<void> {
		const client = getSdkClient();
		const org = client.org(ctx.args.org);
		const options = buildListOptions(ctx.args);
		const sites = await org.sites(options as Parameters<typeof org.sites>[0]);
		printJson({
			current_page: sites.current_page,
			total_pages: sites.total_pages,
			total_items: sites.total_items,
			items: sites.items,
		});
	},
});

export const orgsSitesCommand = defineCommand({
	meta: {
		name: 'sites',
		description: 'Manage sites for an organisation.',
	},
	subCommands: {
		list: orgsSitesListCommand,
	},
});
