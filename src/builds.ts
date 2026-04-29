import { defineCommand } from 'citty';
import { printJson } from './configure/utility.ts';
import { getSdkClient } from './sdk-client.ts';

export const buildsListCommand = defineCommand({
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
	},
	async run(ctx): Promise<void> {
		const client = getSdkClient();
		const builds = await client.site(ctx.args.site).getBuilds();
		printJson(builds);
	},
});

export const buildsPrintLogsCommand = defineCommand({
	meta: {
		name: 'print-logs',
		description: 'Prints the logs for a build.',
	},
	args: {
		uuid: {
			type: 'positional',
			description: 'The build UUID',
			required: true,
		},
	},
	async run(ctx): Promise<void> {
		const client = getSdkClient();
		const resp = await client.build(ctx.args.uuid).get();
		const text = await resp.text();
		if (text) {
			console.log(text);
		}
	},
});

export const buildsCommand = defineCommand({
	meta: {
		name: 'builds',
		description: 'Manage CloudCannon builds.',
	},
	subCommands: {
		list: buildsListCommand,
		'print-logs': buildsPrintLogsCommand,
	},
});
