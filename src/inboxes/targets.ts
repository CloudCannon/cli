import type CloudCannonClient from '@cloudcannon/sdk';
import type {
	CreateInboxTargetOptions,
	InboxTarget,
	ListInboxTargetsOptions,
	UpdateInboxTargetOptions,
} from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { blankFlag, printJson } from '../configure/utility.ts';
import { filterFlagDef, parsePairs } from '../list-options.ts';
import { getSdkClient, handleAPIError } from '../sdk-client.ts';
import { inboxArg, resolveInboxUuid } from './resolve.ts';

type TargetConfig = NonNullable<CreateInboxTargetOptions['config']>;

const TARGET_TYPES = [
	'email',
	'slack',
	'zapier',
	'make',
	'ifttt',
	'discord',
	'teams',
	'hubspot',
	'n8n',
	'pipedream',
	'webhook',
] as const;

const PAYLOAD_FORMATS = [
	'email',
	'raw',
	'slack',
	'discord',
	'teams',
	'ifttt',
	'hubspot',
	'form_encoded',
] as const;

const HUBSPOT_SUBMIT_URL = 'https://api.hsforms.com/submissions/v3/integration/submit';

const HUBSPOT_PORTAL_ID = /^[0-9]+$/;
const HUBSPOT_FORM_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CHALLENGE_RECORD_PREFIX = '_cloudcannon-challenge';

const targetUuidArg = {
	'target-uuid': {
		type: 'string',
		description: 'The inbox target UUID',
		valueHint: 'uuid',
		required: true,
	},
} as const;

const targetConfigArgs = {
	'payload-format': {
		type: 'enum',
		description:
			'Override the payload format sent to the target. An email target accepts only email, a webhook target accepts any format except email, and every other type accepts its own format or raw',
		options: PAYLOAD_FORMATS.slice(),
	},
	'block-spam': {
		type: 'boolean',
		description: 'Hold back submissions flagged by spam detection',
	},
	'block-spam-list': {
		type: 'boolean',
		description: 'Hold back submissions matching the CloudCannon spam blocklist',
	},
	'field-map': {
		type: 'string',
		description:
			'Comma-separated hubspot_field=form_field pairs, required when sending the HubSpot payload format. Replaces the whole map rather than adding to it',
		valueHint: 'field=field,field=field',
	},
} as const;

type TargetConfigArgs = Record<string, string | number | boolean | string[] | undefined>;

function buildTargetConfig(args: TargetConfigArgs): TargetConfig {
	const config: TargetConfig = {};
	if (typeof args.payloadFormat === 'string') {
		config.payload_format = args.payloadFormat;
	}
	if (args.blockSpam !== undefined) {
		config.block_spam = !!args.blockSpam;
	}
	if (args.blockSpamList !== undefined) {
		config.block_spam_list = !!args.blockSpamList;
	}
	if (typeof args.fieldMap === 'string') {
		config.field_map = parsePairs(args.fieldMap, '--field-map');
	}
	return config;
}

function parseTargetConfig(args: TargetConfigArgs): TargetConfig | undefined {
	try {
		return buildTargetConfig(args);
	} catch (err: unknown) {
		console.error(err instanceof Error ? err.message : String(err));
		return undefined;
	}
}

function hostnameOf(target: string): string | undefined {
	try {
		return new URL(target).hostname;
	} catch {
		return undefined;
	}
}

async function reportPendingValidation(
	client: CloudCannonClient,
	target: InboxTarget
): Promise<void> {
	if (target.validated !== false) {
		return;
	}

	if (target.target_type === 'email') {
		console.error(
			`This target is not forwarding yet. CloudCannon has emailed ${target.target}, and forwarding starts once that link is opened. To send that email again, run:`
		);
		console.error(`  cloudcannon inboxes targets revalidate --target-uuid ${target.uuid}`);
		return;
	}

	const host = target.target ? hostnameOf(target.target) : undefined;
	if (!host) {
		return;
	}

	let token: string | undefined;
	if (target.inbox_uuid) {
		try {
			token = (await client.inbox(target.inbox_uuid).get()).organisation_uuid;
		} catch {
			token = undefined;
		}
	}

	console.error(
		`This target is not forwarding yet. Add a DNS TXT record at ${CHALLENGE_RECORD_PREFIX}.${host}, then run:`
	);
	console.error(`  cloudcannon inboxes targets revalidate --target-uuid ${target.uuid}`);

	if (token) {
		console.error(`The value of that record is your Organization UUID, ${token}.`);
	} else {
		console.error(
			'The value of that record is your Organization UUID, which this command could not read. Run `cloudcannon inboxes get` and use the organisation_uuid it prints.'
		);
	}
}

export const inboxesTargetsListCommand = defineCommand({
	meta: {
		name: 'list',
		description: 'List the targets an inbox forwards submissions to.',
	},
	args: {
		...inboxArg,
		...filterFlagDef,
	},
	async run(ctx): Promise<void> {
		const options: ListInboxTargetsOptions = {};
		if (ctx.args.filter !== undefined) {
			try {
				options.filters = parsePairs(String(ctx.args.filter), '--filter');
			} catch (err: unknown) {
				console.error(err instanceof Error ? err.message : String(err));
				process.exitCode = 1;
				return;
			}
		}

		const client = await getSdkClient();
		const inboxUuid = await resolveInboxUuid(client, ctx.args.inbox);
		if (!inboxUuid) {
			process.exitCode = 1;
			return;
		}

		try {
			const targets = await client.inbox(inboxUuid).getTargets(options);
			printJson(targets);
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const inboxesTargetsAddCommand = defineCommand({
	meta: {
		name: 'add',
		description: 'Add a target that an inbox forwards submissions to.',
	},
	args: {
		...inboxArg,
		type: {
			type: 'enum',
			description: 'The integration this target sends to',
			options: [...TARGET_TYPES],
			required: true,
		},
		target: {
			type: 'string',
			description: 'The destination email address or webhook URL, not used by HubSpot targets',
			valueHint: 'email|url',
		},
		'portal-id': {
			type: 'string',
			description: 'The HubSpot portal ID, used instead of --target for HubSpot targets',
			valueHint: 'id',
		},
		'form-guid': {
			type: 'string',
			description: 'The HubSpot form GUID, used instead of --target for HubSpot targets',
			valueHint: 'guid',
		},
		...targetConfigArgs,
	},
	async run(ctx): Promise<void> {
		const targetType = ctx.args.type;
		if (!targetType) {
			console.error(`--type is required. Choose one of: ${TARGET_TYPES.join(', ')}.`);
			process.exitCode = 1;
			return;
		}

		let target: string;

		if (targetType === 'hubspot') {
			const portalId = typeof ctx.args.portalId === 'string' ? ctx.args.portalId.trim() : '';
			const formGuid = typeof ctx.args.formGuid === 'string' ? ctx.args.formGuid.trim() : '';
			if (!portalId || !formGuid) {
				console.error('HubSpot targets need both --portal-id and --form-guid.');
				process.exitCode = 1;
				return;
			}
			if (!HUBSPOT_PORTAL_ID.test(portalId)) {
				console.error('--portal-id must be a HubSpot portal ID, which is digits only.');
				process.exitCode = 1;
				return;
			}
			if (!HUBSPOT_FORM_GUID.test(formGuid)) {
				console.error('--form-guid must be a HubSpot form GUID, which is a UUID.');
				process.exitCode = 1;
				return;
			}
			if (ctx.args.payloadFormat !== 'raw' && ctx.args.fieldMap === undefined) {
				console.error(
					'HubSpot targets need --field-map, which maps HubSpot field names to your form field names.'
				);
				process.exitCode = 1;
				return;
			}
			target = `${HUBSPOT_SUBMIT_URL}/${portalId}/${formGuid}`;
		} else {
			if (!ctx.args.target) {
				console.error(`--target is required for ${targetType} targets.`);
				process.exitCode = 1;
				return;
			}
			target = ctx.args.target;
		}

		const config = parseTargetConfig(ctx.args);
		if (!config) {
			process.exitCode = 1;
			return;
		}
		const body: CreateInboxTargetOptions = { target_type: targetType, target };
		if (Object.keys(config).length > 0) {
			body.config = config;
		}

		const client = await getSdkClient();
		const inboxUuid = await resolveInboxUuid(client, ctx.args.inbox);
		if (!inboxUuid) {
			process.exitCode = 1;
			return;
		}

		try {
			const created = await client.inbox(inboxUuid).createTarget(body);
			printJson(created);
			await reportPendingValidation(client, created);
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const inboxesTargetsUpdateCommand = defineCommand({
	meta: {
		name: 'update',
		description:
			"Update an inbox target's destination and options. A target's type cannot be changed, so remove and add a target to send somewhere of a different type.",
	},
	args: {
		...targetUuidArg,
		target: {
			type: 'string',
			description:
				'A new destination email address or webhook URL. Changing this starts validation again, so the target stops forwarding until it passes',
			valueHint: 'email|url',
		},
		...targetConfigArgs,
	},
	async run(ctx): Promise<void> {
		const config = parseTargetConfig(ctx.args);
		if (!config) {
			process.exitCode = 1;
			return;
		}
		if (blankFlag(ctx.args.target, '--target')) {
			process.exitCode = 1;
			return;
		}

		const newTarget = typeof ctx.args.target === 'string' ? ctx.args.target : undefined;
		if (Object.keys(config).length === 0 && newTarget === undefined) {
			console.error(
				'Nothing to update. Provide --target, --payload-format, --block-spam, --block-spam-list, or --field-map.'
			);
			process.exitCode = 1;
			return;
		}

		const client = await getSdkClient();
		const targetClient = client.inboxTarget(String(ctx.args.targetUuid));

		try {
			const body: UpdateInboxTargetOptions = {};
			if (newTarget !== undefined) {
				body.target = newTarget;
			}

			if (Object.keys(config).length > 0) {
				const existing = await targetClient.get();
				body.config = { ...(existing.config ?? {}), ...config };
			}

			const updated = await targetClient.update(body);
			printJson(updated);
			await reportPendingValidation(client, updated);
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const inboxesTargetsRemoveCommand = defineCommand({
	meta: {
		name: 'remove',
		description: 'Remove a target from an inbox.',
	},
	args: {
		...targetUuidArg,
		force: {
			type: 'boolean',
			description: 'Confirm the removal without being asked',
		},
	},
	async run(ctx): Promise<void> {
		if (!ctx.args.force) {
			console.error(
				'Removing a target stops it receiving submissions. Re-run with --force to confirm.'
			);
			process.exitCode = 1;
			return;
		}

		const client = await getSdkClient();

		try {
			await client.inboxTarget(String(ctx.args.targetUuid)).delete();
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
			return;
		}

		console.error('Target removed.');
	},
});

export const inboxesTargetsRevalidateCommand = defineCommand({
	meta: {
		name: 'revalidate',
		description:
			'Restart validation for a target. Email targets are sent another verification email, and webhook targets are checked for their DNS TXT record again.',
	},
	args: targetUuidArg,
	async run(ctx): Promise<void> {
		const client = await getSdkClient();

		try {
			const target = await client.inboxTarget(String(ctx.args.targetUuid)).revalidate();
			printJson(target);
			await reportPendingValidation(client, target);
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const inboxesTargetsCommand = defineCommand({
	meta: {
		name: 'targets',
		description: 'Manage the targets an inbox forwards submissions to.',
	},
	subCommands: {
		list: inboxesTargetsListCommand,
		add: inboxesTargetsAddCommand,
		update: inboxesTargetsUpdateCommand,
		remove: inboxesTargetsRemoveCommand,
		revalidate: inboxesTargetsRevalidateCommand,
	},
});
