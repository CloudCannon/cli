import type { ConnectInboxOptions, Inbox, UpdateInboxSettingsOptions } from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { blankFlag, printJson } from './configure/utility.ts';
import { inboxArg, resolveInboxUuid } from './inboxes/resolve.ts';
import { inboxesSubmissionsCommand } from './inboxes/submissions.ts';
import { inboxesTargetsCommand } from './inboxes/targets.ts';
import { getSdkClient, handleAPIError } from './sdk-client.ts';
import { resolveSiteUuid } from './sites/resolve.ts';

const CAPTCHA_TYPES = ['google', 'google_enterprise', 'hcaptcha', 'turnstile'] as const;

const INVALID_COUNT = Symbol('invalid count');

function hasCaptchaProvider(inbox: Inbox): boolean {
	return !!inbox.captcha_type && !!inbox.captcha_key && !!inbox.has_captcha_secret;
}

const MAX_COUNT = 2_147_483_647;

const INVALID_SCORE = Symbol('invalid score');

function parseScore(value: unknown, flag: string): number | undefined | typeof INVALID_SCORE {
	if (value === undefined) {
		return undefined;
	}

	const score = typeof value === 'string' && value.trim() ? Number(value.trim()) : Number.NaN;
	if (Number.isNaN(score) || score < 0 || score > 1) {
		console.error(`${flag} needs a number from 0 to 1.`);
		return INVALID_SCORE;
	}

	return score;
}

function parseCount(value: unknown, flag: string): number | undefined | typeof INVALID_COUNT {
	if (value === undefined) {
		return undefined;
	}

	// A flag passed without a value arrives as an empty string, which Number() reads as 0,
	// so digits are required rather than inferred.
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
			description:
				"The captcha provider's secret key, or a Google Cloud API key for google_enterprise. It is never shown again",
			valueHint: 'secret',
		},
		'captcha-project-id': {
			type: 'string',
			description:
				'The Google Cloud project ID holding the reCAPTCHA key, required for google_enterprise',
			valueHint: 'project',
		},
		'captcha-min-score': {
			type: 'string',
			description:
				'Reject reCAPTCHA tokens scoring below this, from 0 to 1. Applies to google (v3 only) and google_enterprise, and is 0.5 unless set',
			valueHint: 'score',
		},
		'captcha-send-sitekey': {
			type: 'boolean',
			description:
				'Tell hCaptcha which site key to expect, so it rejects a token from a form using another of your site keys. On unless turned off',
			negativeDescription:
				'Let hCaptcha accept a token from any site key on your account. Pass --captcha-send-sitekey to turn it back on',
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
				['--captcha-project-id', ctx.args.captchaProjectId],
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
				'A captcha is turned on by naming its provider. Use --captcha-type with --captcha-key and --captcha-secret, and --captcha-project-id for google_enterprise.'
			);
			process.exitCode = 1;
			return;
		}
		if (ctx.args.captcha === false) {
			if (
				ctx.args.captchaType ||
				ctx.args.captchaKey ||
				ctx.args.captchaSecret ||
				ctx.args.captchaProjectId ||
				ctx.args.captchaMinScore !== undefined ||
				ctx.args.captchaSendSitekey !== undefined
			) {
				console.error('--no-captcha cannot be combined with the other captcha flags.');
				process.exitCode = 1;
				return;
			}

			body.captcha_type = null;
			body.captcha_key = null;
			body.captcha_secret = null;
			body.captcha_config = {};
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
		const minScore = parseScore(ctx.args.captchaMinScore, '--captcha-min-score');
		if (minScore === INVALID_SCORE) {
			process.exitCode = 1;
			return;
		}

		const captchaConfig: Record<string, unknown> = {};
		if (typeof ctx.args.captchaProjectId === 'string') {
			captchaConfig.project_id = ctx.args.captchaProjectId;
		}
		if (minScore !== undefined) {
			captchaConfig.min_score = minScore;
		}
		if (ctx.args.captchaSendSitekey !== undefined) {
			captchaConfig.send_sitekey = !!ctx.args.captchaSendSitekey;
		}
		if (Object.keys(captchaConfig).length > 0) {
			body.captcha_config = captchaConfig;
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
				'Nothing to update. Provide --name, --key, --allow-uploads, --keep-form-hook-days, --captcha-type, --captcha-key, --captcha-secret, --captcha-project-id, --captcha-min-score, --captcha-send-sitekey, or --no-captcha.'
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
		'require-captcha': {
			type: 'boolean',
			description:
				"Reject submissions from this site without the inbox's captcha. Defaults to on when the inbox has a captcha provider, so add the provider's widget to your forms first",
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
			body.require_captcha =
				ctx.args.requireCaptcha === undefined
					? hasCaptchaProvider(await client.inbox(inboxUuid).get())
					: !!ctx.args.requireCaptcha;

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
