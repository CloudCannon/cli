import { defineCommand } from 'citty';
import { printJson } from '../configure/utility.ts';
import { buildListOptions, listFlagDefs } from '../list-options.ts';
import { getSdkClient } from '../sdk-client.ts';

export const sitesBuildsListCommand = defineCommand({
	meta: {
		name: 'list',
		description: 'List builds for a site.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site UUID',
			valueHint: 'uuid',
			required: true,
		},
		...listFlagDefs,
	},
	async run(ctx): Promise<void> {
		const client = getSdkClient();
		const site = client.site(ctx.args.site);
		const options = buildListOptions(ctx.args);
		const builds = await site.getBuilds(options as Parameters<typeof site.getBuilds>[0]);
		printJson({
			current_page: builds.current_page,
			total_pages: builds.total_pages,
			total_items: builds.total_items,
			items: builds.items,
		});
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
