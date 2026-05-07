import type CloudCannonClient from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { getSdkClient } from '../sdk-client.ts';

const siteArgs = {
	site: {
		type: 'string',
		description: 'The site UUID',
		valueHint: 'uuid',
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
	const builds = await site.getBuilds(options as Parameters<typeof site.getBuilds>[0]);
	const latest = builds.items[0];
	if (!latest) {
		console.log(
			onlyFailed ? 'No failed builds found for this site.' : 'No builds found for this site.'
		);
		return;
	}
	if (!latest.uuid) {
		console.log('Latest build is missing a UUID.');
		return;
	}
	const resp = await client.build(latest.uuid).get();
	const text = await resp.text();
	if (text) {
		console.log(text);
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
	const syncs = await site.getSyncs(options as Parameters<typeof site.getSyncs>[0]);
	const latest = syncs.items[0];
	if (!latest) {
		console.log(
			onlyFailed ? 'No failed syncs found for this site.' : 'No syncs found for this site.'
		);
		return;
	}
	if (!latest.uuid) {
		console.log('Latest sync is missing a UUID.');
		return;
	}
	const resp = await client.sync(latest.uuid).get();
	const text = await resp.text();
	if (text) {
		console.log(text);
	}
}

export const sitesPrintLastBuildCommand = defineCommand({
	meta: {
		name: 'print-last-build',
		description: 'Print the logs for the most recent build of a site.',
	},
	args: siteArgs,
	async run(ctx): Promise<void> {
		await printLatestBuildLogs(getSdkClient(), ctx.args.site, false);
	},
});

export const sitesPrintLastFailedBuildCommand = defineCommand({
	meta: {
		name: 'print-last-failed-build',
		description: 'Print the logs for the most recent failed build of a site.',
	},
	args: siteArgs,
	async run(ctx): Promise<void> {
		await printLatestBuildLogs(getSdkClient(), ctx.args.site, true);
	},
});

export const sitesPrintLastSyncCommand = defineCommand({
	meta: {
		name: 'print-last-sync',
		description: 'Print the logs for the most recent sync of a site.',
	},
	args: siteArgs,
	async run(ctx): Promise<void> {
		await printLatestSyncLogs(getSdkClient(), ctx.args.site, false);
	},
});

export const sitesPrintLastFailedSyncCommand = defineCommand({
	meta: {
		name: 'print-last-failed-sync',
		description: 'Print the logs for the most recent failed sync of a site.',
	},
	args: siteArgs,
	async run(ctx): Promise<void> {
		await printLatestSyncLogs(getSdkClient(), ctx.args.site, true);
	},
});
