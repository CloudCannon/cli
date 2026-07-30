import type { ListOrgSitesOptions } from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { printJson } from '../configure/utility.ts';
import { buildListOptions, listFlagDefs } from '../list-options.ts';
import { getSdkClient, handleAPIError } from '../sdk-client.ts';
import { resolveOrg } from './resolve.ts';

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
		},
		...listFlagDefs,
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const org = await resolveOrg(client, ctx.args.org as string | undefined);
		if (!org) {
			process.exitCode = 1;
			return;
		}
		const orgClient = client.org(org.uuid);
		const options = buildListOptions(ctx.args);
		try {
			const sites = await orgClient.sites(options as ListOrgSitesOptions);
			printJson({
				current_page: sites.current_page,
				total_pages: sites.total_pages,
				total_items: sites.total_items,
				items: sites.items,
			});
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
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
