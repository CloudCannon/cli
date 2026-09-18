import type { ConnectInboxOptions, UpdateInboxSettingsOptions } from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { blankFlag, printJson } from './configure/utility.ts';
import { inboxArg, resolveInboxUuid } from './inboxes/resolve.ts';
import { inboxesSubmissionsCommand } from './inboxes/submissions.ts';
import { inboxesTargetsCommand } from './inboxes/targets.ts';
import { getSdkClient, handleAPIError } from './sdk-client.ts';
import { resolveSiteUuid } from './sites/resolve.ts';

const CAPTCHA_TYPES = ['google', 'hcaptcha', 'turnstile'] as const;

const INVALID_COUNT = Symbol('invalid count');

const MAX_COUNT = 2_147_483_647;

function parseCount(value: unknown, flag: string): number | undefined | typeof INVALID_COUNT {
	if (value === undefined) {
		return undefined;
	}

	// A flag passed without a value arrives as an empty string, which Number() reads as 0.
	// A quota of 0 rejects every submission, so digits are required rather than inferred.
	if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
		console.error(`${flag} needs a whole number of 0 or more.`);
		return INVALID_COUNT;
	}

	const count = Number(value.trim());
	if (count > MAX_COUNT) {
		console.error(`${flag} cannot be more than ${MAX_COUNT}.`);
		return INVALID_COUNT;
	}

	return count;
}

export const inboxesGetCommand = defineCommand({
	meta: {
		name: 'get',
		description: 'Get an inbox by name, ID, key, or UUID, including the key your forms post to.',
	},
	args: inboxArg,
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const inboxUuid = await resolveInboxUuid(client, ctx.args.inbox);
		if (!inboxUuid) {
			process.exitCode = 1;
			return;
		}

		try {
			const inbox = await client.inbox(inboxUuid).get();
			printJson(inbox);
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const inboxesUpdateCommand = defineCommand({
	meta: {
		name: 'update',
		description: "Update an inbox's settings.",
	},
	args: {
		...inboxArg,
		name: {
			type: 'string',
			description: 'A new name for the inbox',
			valueHint: 'name',
		},
		key: {
			type: 'string',
			description: 'A new key for the inbox, which changes where your forms post to',
			valueHint: 'key',
		},
		'allow-uploads': {
			type: 'boolean',
			description: 'Accept file uploads from forms posting to this inbox',
		},
		'monthly-quota': {
			type: 'string',
			description: 'The maximum number of submissions to accept per month',
			valueHint: 'n',
		},
		'keep-form-hook-days': {
			type: 'string',
			description: 'The number of days to retain submissions',
			valueHint: 'days',
		},
		'captcha-type': {
			type: 'enum',
			description: 'The captcha provider checking submissions to this inbox',
			options: CAPTCHA_TYPES.slice(),
		},
		'captcha-key': {
			type: 'string',
			description: "The captcha provider's site key",
			valueHint: 'key',
		},
		'captcha-secret': {
			type: 'string',
			description: "The captcha provider's secret key",
			valueHint: 'secret',
		},
		captcha: {
			type: 'boolean',
			description:
				'Pass --no-captcha to stop checking submissions to this inbox with a captcha, which clears the provider and its keys',
		},
	},
	async run(ctx): Promise<void> {
		const blank = (
			[
				['--name', ctx.args.name],
				['--key', ctx.args.key],
				['--captcha-key', ctx.args.captchaKey],
				['--captcha-secret', ctx.args.captchaSecret],
			] as const
		).some(([flag, value]) => blankFlag(value, flag));
		if (blank) {
			process.exitCode = 1;
			return;
		}

		const body: UpdateInboxSettingsOptions = {};
		if (typeof ctx.args.name === 'string') {
			body.name = ctx.args.name;
		}
		if (typeof ctx.args.key === 'string') {
			body.key = ctx.args.key;
		}
		if (ctx.args.allowUploads !== undefined) {
			body.allow_uploads = !!ctx.args.allowUploads;
		}
		if (ctx.args.captcha === true) {
			console.error(
				'A captcha is turned on by naming its provider. Use --captcha-type with --captcha-key and --captcha-secret.'
			);
			process.exitCode = 1;
			return;
		}
		if (ctx.args.captcha === false) {
			if (ctx.args.captchaType || ctx.args.captchaKey || ctx.args.captchaSecret) {
				console.error('--no-captcha cannot be combined with the other captcha flags.');
				process.exitCode = 1;
				return;
			}

			body.captcha_type = null;
			body.captcha_key = null;
			body.captcha_secret = null;
		}
		if (typeof ctx.args.captchaType === 'string') {
			body.captcha_type = ctx.args.captchaType;
		}
		if (typeof ctx.args.captchaKey === 'string') {
			body.captcha_key = ctx.args.captchaKey;
		}
		if (typeof ctx.args.captchaSecret === 'string') {
			body.captcha_secret = ctx.args.captchaSecret;
		}

		const monthlyQuota = parseCount(ctx.args.monthlyQuota, '--monthly-quota');
		if (monthlyQuota === INVALID_COUNT) {
			process.exitCode = 1;
			return;
		}
		if (monthlyQuota !== undefined) {
			body.monthly_quota = monthlyQuota;
		}

		const keepDays = parseCount(ctx.args.keepFormHookDays, '--keep-form-hook-days');
		if (keepDays === INVALID_COUNT) {
			process.exitCode = 1;
			return;
		}
		if (keepDays !== undefined) {
			body.keep_form_hook_days = keepDays;
		}

		if (Object.keys(body).length === 0) {
			console.error(
				'Nothing to update. Provide --name, --key, --allow-uploads, --monthly-quota, --keep-form-hook-days, --captcha-type, --captcha-key, --captcha-secret, or --no-captcha.'
			);
			process.exitCode = 1;
			return;
		}

		const client = await getSdkClient();
		const inboxUuid = await resolveInboxUuid(client, ctx.args.inbox);
		if (!inboxUuid) {
			process.exitCode = 1;
			return;
		}

		const inboxClient = client.inbox(inboxUuid);

		try {
			const inbox = await inboxClient.update(body);
			printJson(inbox);
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const inboxesDeleteCommand = defineCommand({
	meta: {
		name: 'delete',
		description: 'Delete an inbox, along with its submissions and targets.',
	},
	args: {
		...inboxArg,
		force: {
			type: 'boolean',
			description: 'Confirm the deletion without being asked',
		},
	},
	async run(ctx): Promise<void> {
		if (!ctx.args.force) {
			console.error(
				'Deleting an inbox also deletes its submissions and targets. Re-run with --force to confirm.'
			);
			process.exitCode = 1;
			return;
		}

		const client = await getSdkClient();
		const inboxUuid = await resolveInboxUuid(client, ctx.args.inbox);
		if (!inboxUuid) {
			process.exitCode = 1;
			return;
		}

		try {
			await client.inbox(inboxUuid).delete();
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
			return;
		}

		console.error('Inbox deleted.');
	},
});

export const inboxesConnectCommand = defineCommand({
	meta: {
		name: 'connect',
		description: 'Connect a site to an inbox so its forms can post submissions.',
	},
	args: {
		...inboxArg,
		site: {
			type: 'string',
			description: 'The site name, ID, UUID, or domain',
			valueHint: 'name|id|uuid|domain',
			required: true,
		},
		default: {
			type: 'boolean',
			description: "Make this the site's default inbox",
		},
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const inboxUuid = await resolveInboxUuid(client, ctx.args.inbox);
		if (!inboxUuid) {
			process.exitCode = 1;
			return;
		}

		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}

		const body: ConnectInboxOptions = { inbox_uuid: inboxUuid };
		if (ctx.args.default !== undefined) {
			body.default_inbox = !!ctx.args.default;
		}

		try {
			const siteInbox = await client.site(siteUuid).connectInbox(body);
			printJson(siteInbox);
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const inboxesDisconnectCommand = defineCommand({
	meta: {
		name: 'disconnect',
		description: 'Disconnect a site from an inbox so its forms stop posting submissions to it.',
	},
	args: {
		...inboxArg,
		site: {
			type: 'string',
			description: 'The site name, ID, UUID, or domain',
			valueHint: 'name|id|uuid|domain',
			required: true,
		},
		force: {
			type: 'boolean',
			description: 'Confirm the disconnection without being asked',
		},
	},
	async run(ctx): Promise<void> {
		if (!ctx.args.force) {
			console.error(
				'Disconnecting stops this site posting submissions to the inbox. Re-run with --force to confirm.'
			);
			process.exitCode = 1;
			return;
		}

		const client = await getSdkClient();
		const inboxUuid = await resolveInboxUuid(client, ctx.args.inbox);
		if (!inboxUuid) {
			process.exitCode = 1;
			return;
		}

		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}

		try {
			const connections = await client.site(siteUuid).getInboxConnections();
			const connection = connections.find((item) => item.inbox_uuid === inboxUuid);
			if (!connection?.uuid) {
				console.error('That site is not connected to that inbox.');
				process.exitCode = 1;
				return;
			}

			await client.siteInbox(connection.uuid).delete();
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
			return;
		}

		console.error('Site disconnected from inbox.');
	},
});

export const inboxesCommand = defineCommand({
	meta: {
		name: 'inboxes',
		description: 'Manage CloudCannon inboxes.',
	},
	subCommands: {
		get: inboxesGetCommand,
		update: inboxesUpdateCommand,
		delete: inboxesDeleteCommand,
		connect: inboxesConnectCommand,
		disconnect: inboxesDisconnectCommand,
		submissions: inboxesSubmissionsCommand,
		targets: inboxesTargetsCommand,
	},
});
