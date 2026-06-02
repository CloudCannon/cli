import type { ListOrgSitesOptions } from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { printJson } from '../configure/utility.ts';
import { buildListOptions, listFlagDefs } from '../list-options.ts';
import { getSdkClient } from '../sdk-client.ts';
import { resolveOrgUuid } from './resolve.ts';

export const orgsSitesListCommand = defineCommand({
	meta: {
		name: 'list',
		description: 'List all sites for an organisation.',
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
		const sites = await org.sites(options as ListOrgSitesOptions);
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
