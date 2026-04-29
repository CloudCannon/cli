import { defineCommand } from 'citty';
import { getSdkClient } from './sdk-client.ts';

export const orgsListCommand = defineCommand({
	meta: {
		name: 'list',
		description: 'List all organisations.',
	},
	async run(): Promise<void> {
		const client = getSdkClient();
		const orgs = await client.orgs();
		console.log(JSON.stringify(orgs, null, 2));
	},
});

export const orgsGetCommand = defineCommand({
	meta: {
		name: 'get',
		description: 'Get an organisation by UUID.',
	},
	args: {
		uuid: {
			type: 'positional',
			description: 'The organisation UUID',
			required: true,
		},
	},
	async run(ctx): Promise<void> {
		const client = getSdkClient();
		const org = await client.org(ctx.args.uuid).get();
		console.log(JSON.stringify(org, null, 2));
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
	},
});
