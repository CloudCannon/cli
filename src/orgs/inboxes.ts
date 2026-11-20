import type { ListOrgInboxesOptions } from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { printJson } from '../configure/utility.ts';
import { listFlagDefs, parseListOptions } from '../list-options.ts';
import { getSdkClient, handleAPIError } from '../sdk-client.ts';
import { resolveOrg } from './resolve.ts';

export const orgsInboxesListCommand = defineCommand({
	meta: {
		name: 'list',
		description: 'List all inboxes for an Organization.',
	},
	args: {
		org: {
			type: 'string',
			description: 'The Organization name, ID, or UUID',
			valueHint: 'name|id|uuid',
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
		const org = await resolveOrg(client, ctx.args.org);
		if (!org) {
			process.exitCode = 1;
			return;
		}
		const orgClient = client.org(org.uuid);
		try {
			const inboxes = await orgClient.getInboxes(options as ListOrgInboxesOptions);
			printJson({
				current_page: inboxes.current_page,
				total_pages: inboxes.total_pages,
				total_items: inboxes.total_items,
				items: inboxes.items,
			});
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

function toKey(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export const orgsInboxesCreateCommand = defineCommand({
	meta: {
		name: 'create',
		description: 'Create an inbox for an Organization.',
	},
	args: {
		org: {
			type: 'string',
			description: 'The Organization name, ID, or UUID',
			valueHint: 'name|id|uuid',
		},
		name: {
			type: 'string',
			description: 'The inbox name',
			valueHint: 'name',
			required: true,
		},
		key: {
			type: 'string',
			description: 'The inbox key your forms post to, which defaults to a slug of the name',
			valueHint: 'key',
		},
	},
	async run(ctx): Promise<void> {
		const key =
			typeof ctx.args.key === 'string' && ctx.args.key ? ctx.args.key : toKey(ctx.args.name);
		if (!key) {
			console.error('Could not build a key from the inbox name. Provide one with --key.');
			process.exitCode = 1;
			return;
		}

		const client = await getSdkClient();
		const org = await resolveOrg(client, ctx.args.org);
		if (!org) {
			process.exitCode = 1;
			return;
		}

		try {
			const inbox = await client.org(org.uuid).createInbox({ name: ctx.args.name, key });
			printJson(inbox);
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const orgsInboxesCommand = defineCommand({
	meta: {
		name: 'inboxes',
		description: 'Manage inboxes for an Organization.',
	},
	subCommands: {
		list: orgsInboxesListCommand,
		create: orgsInboxesCreateCommand,
	},
});
