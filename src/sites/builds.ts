import type { ListSiteBuildsOptions } from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { printJson } from '../configure/utility.ts';
import { listFlagDefs, parseListOptions } from '../list-options.ts';
import { getSdkClient, handleAPIError } from '../sdk-client.ts';
import { resolveSiteUuid } from './resolve.ts';

export const sitesBuildsListCommand = defineCommand({
	meta: {
		name: 'list',
		description: 'List builds for a site.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site name, ID, UUID, or domain',
			valueHint: 'name|id|uuid|domain',
			required: true,
		},
		...listFlagDefs,
	},
	async run(ctx): Promise<void> {
		const options = parseListOptions(ctx.args);
		if (!options) {
			process.exitCode = 1;
			return;
		}
		const client = await getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}
		const site = client.site(siteUuid);
		try {
			const builds = await site.getBuilds(options as ListSiteBuildsOptions);
			printJson({
				current_page: builds.current_page,
				total_pages: builds.total_pages,
				total_items: builds.total_items,
				items: builds.items,
			});
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const sitesBuildsCommand = defineCommand({
	meta: {
		name: 'builds',
		description: 'Manage builds for a site.',
	},
	subCommands: {
		list: sitesBuildsListCommand,
	},
});
