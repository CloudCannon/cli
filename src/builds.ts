import { defineCommand } from 'citty';
import { getSdkClient } from './sdk-client.ts';

export const buildsPrintLogsCommand = defineCommand({
	meta: {
		name: 'print-logs',
		description: 'Prints the logs for a build.',
	},
	args: {
		build: {
			type: 'string',
			description: 'The build UUID',
			valueHint: 'uuid',
			required: true,
		},
	},
	async run(ctx): Promise<void> {
		const client = getSdkClient();
		const resp = await client.build(ctx.args.build).get();
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
		'print-logs': buildsPrintLogsCommand,
	},
});
