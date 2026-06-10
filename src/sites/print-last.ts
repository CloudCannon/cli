import type CloudCannonClient from '@cloudcannon/sdk';
import type {
	Build,
	ListSiteBuildsOptions,
	ListSiteSyncsOptions,
	PaginatedResponse,
	Sync,
} from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { getSdkClient, handleAPIError } from '../sdk-client.ts';
import { resolveSiteUuid } from './resolve.ts';

const siteArgs = {
	site: {
		type: 'string',
		description: 'The site name, ID, UUID, or domain',
		valueHint: 'name|id|uuid|domain',
		required: true,
	},
} as const;

async function printLatestBuildLogs(
	client: CloudCannonClient,
	siteUuid: string,
	onlyFailed: boolean
): Promise<void> {
	const site = client.site(siteUuid);
	const options: Record<string, unknown> = {
		items: 1,
		sort_attribute: 'created_at',
		sort_direction: 'DESC',
	};
	if (onlyFailed) {
		options.filters = { successful: false };
	}
	let builds: PaginatedResponse<Build>;
	try {
		builds = await site.getBuilds(options as ListSiteBuildsOptions);
	} catch (err: unknown) {
		handleAPIError(err);
		process.exitCode = 1;
		return;
	}
	const latest = builds.items[0];
	if (!latest) {
		console.log(
			onlyFailed ? 'No failed builds found for this site.' : 'No builds found for this site.'
		);
		return;
	}
	try {
		const resp = await client.build(latest.uuid).get();
		const text = await resp.text();
		if (text) {
			const cleanedText = text
				.replace(/ ?\[⏱(\d+)ms\]/gm, '')
				.replace(/ ?\[🏷[^\]]*\]/gm, '')
				.replace(/\x1b\[\d*m/gm, '')
				.trim();

			console.log(cleanedText);
		}
	} catch (err: unknown) {
		handleAPIError(err);
		process.exitCode = 1;
	}
}

async function printLatestSyncLogs(
	client: CloudCannonClient,
	siteUuid: string,
	onlyFailed: boolean
): Promise<void> {
	const site = client.site(siteUuid);
	const options: Record<string, unknown> = {
		items: 1,
		sort_attribute: 'created_at',
		sort_direction: 'DESC',
	};
	if (onlyFailed) {
		options.filters = { successful: false };
	}
	let syncs: PaginatedResponse<Sync>;
	try {
		syncs = await site.getSyncs(options as ListSiteSyncsOptions);
	} catch (err: unknown) {
		handleAPIError(err);
		process.exitCode = 1;
		return;
	}
	const latest = syncs.items[0];
	if (!latest) {
		console.log(
			onlyFailed ? 'No failed syncs found for this site.' : 'No syncs found for this site.'
		);
		return;
	}
	try {
		const resp = await client.sync(latest.uuid).get();
		const text = await resp.text();
		if (text) {
			const cleanedText = text
				.replace(/ ?\[⏱(\d+)ms\]/gm, '')
				.replace(/ ?\[🏷[^\]]*\]/gm, '')
				.replace(/\x1b\[\d*m/gm, '')
				.trim();

			console.log(cleanedText);
		}
	} catch (err: unknown) {
		handleAPIError(err);
		process.exitCode = 1;
	}
}

export const sitesPrintLastBuildCommand = defineCommand({
	meta: {
		name: 'print-last-build',
		description: 'Print the logs for the most recent build of a site.',
	},
	args: siteArgs,
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}
		await printLatestBuildLogs(client, siteUuid, false);
	},
});

export const sitesPrintLastFailedBuildCommand = defineCommand({
	meta: {
		name: 'print-last-failed-build',
		description: 'Print the logs for the most recent failed build of a site.',
	},
	args: siteArgs,
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}
		await printLatestBuildLogs(client, siteUuid, true);
	},
});

export const sitesPrintLastSyncCommand = defineCommand({
	meta: {
		name: 'print-last-sync',
		description: 'Print the logs for the most recent sync of a site.',
	},
	args: siteArgs,
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}
		await printLatestSyncLogs(client, siteUuid, false);
	},
});

export const sitesPrintLastFailedSyncCommand = defineCommand({
	meta: {
		name: 'print-last-failed-sync',
		description: 'Print the logs for the most recent failed sync of a site.',
	},
	args: siteArgs,
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}
		await printLatestSyncLogs(client, siteUuid, true);
	},
});
