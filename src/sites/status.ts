import type CloudCannonClient from '@cloudcannon/sdk';
import type { Build, Site, Sync } from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { printJson } from '../configure/utility.ts';
import { resolveOrg } from '../orgs/resolve.ts';
import { getSdkClient, handleAPIError } from '../sdk-client.ts';

export type SiteStatus = 'No New Build' | 'Syncing' | 'Building' | 'Built' | 'Failed';

export type SiteStatusRow = {
	site_name: string;
	uuid: string;
	id: number;
	branch: string | null;
	status: SiteStatus;
};

export type FormatPreset = 'lines' | 'table' | 'csv';

export type ResolvedFormat =
	| { kind: 'json' }
	| { kind: 'preset'; name: FormatPreset }
	| { kind: 'template'; render: (row: SiteStatusRow) => string };

type ProviderDetails = {
	branch?: string;
	full_name?: string;
	publish_branch?: string;
};

const CONCURRENCY = 8;
const DEFAULT_WATCH_INTERVAL_SECONDS = 10;
const FORMAT_PRESETS = new Set<FormatPreset>(['lines', 'table', 'csv']);
const TEMPLATE_FIELDS = ['site_name', 'uuid', 'id', 'branch', 'status'] as const;
type TemplateField = (typeof TEMPLATE_FIELDS)[number];

function getSiteBranch(site: Site): string | null {
	const details = site.storage_provider_details as ProviderDetails | null | undefined;
	return details?.branch ?? null;
}

function startOfLocalDay(now = new Date()): Date {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isOnOrAfterLocalDay(iso: string | null | undefined, dayStart: Date): boolean {
	if (!iso) {
		return false;
	}
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return false;
	}
	return date >= dayStart;
}

function isInProgress(record: { successful?: boolean | null; completed_at?: string | null }): boolean {
	return record.successful == null && !record.completed_at;
}

export function deriveStatus(latestBuild: Build | undefined, latestSync: Sync | undefined): SiteStatus {
	const dayStart = startOfLocalDay();

	if (latestSync && isInProgress(latestSync)) {
		return 'Syncing';
	}
	if (latestBuild && isInProgress(latestBuild)) {
		return 'Building';
	}

	const buildToday = latestBuild && isOnOrAfterLocalDay(latestBuild.created_at, dayStart);
	const syncToday = latestSync && isOnOrAfterLocalDay(latestSync.created_at, dayStart);

	if (!buildToday) {
		if (syncToday && latestSync?.successful === false) {
			return 'Failed';
		}
		return 'No New Build';
	}

	if (latestBuild.successful === false) {
		return 'Failed';
	}

	if (
		syncToday &&
		latestSync?.successful === false &&
		(!latestBuild.created_at ||
			!latestSync.created_at ||
			new Date(latestSync.created_at) > new Date(latestBuild.created_at))
	) {
		return 'Failed';
	}

	if (latestBuild.successful === true) {
		return 'Built';
	}

	return 'No New Build';
}

function matchesFilters(site: Site, opts: { branch?: string; match?: RegExp }): boolean {
	const branch = getSiteBranch(site);
	if (opts.branch !== undefined && branch !== opts.branch) {
		return false;
	}
	if (!opts.match) {
		return true;
	}
	const haystack = [
		site.site_name,
		site.uuid,
		String(site.id),
		site.domain_name ?? '',
		site.stable_domain ?? '',
		branch ?? '',
	].join('\n');
	return opts.match.test(haystack);
}

async function listSitesForOrg(client: CloudCannonClient, orgUuid: string): Promise<Site[]> {
	const sites: Site[] = [];
	let page = 1;
	let totalPages = 1;
	do {
		const resp = await client.org(orgUuid).sites({ page, items: 100 });
		sites.push(...resp.items);
		totalPages = resp.total_pages ?? 1;
		page += 1;
	} while (page <= totalPages);
	return sites;
}

async function listSites(client: CloudCannonClient, orgUuid?: string): Promise<Site[]> {
	if (orgUuid) {
		return listSitesForOrg(client, orgUuid);
	}
	const orgs = await client.orgs();
	const all: Site[] = [];
	for (const org of orgs.items) {
		if (!org.uuid) {
			continue;
		}
		all.push(...(await listSitesForOrg(client, org.uuid)));
	}
	return all;
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		while (nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			results[index] = await fn(items[index]);
		}
	}

	const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
	await Promise.all(workers);
	return results;
}

async function fetchSiteStatus(client: CloudCannonClient, site: Site): Promise<SiteStatusRow> {
	const siteClient = client.site(site.uuid);
	const listOptions = {
		items: 1,
		sort_attribute: 'created_at' as const,
		sort_direction: 'DESC' as const,
	};
	const [builds, syncs] = await Promise.all([
		siteClient.getBuilds(listOptions),
		siteClient.getSyncs(listOptions),
	]);
	return {
		site_name: site.site_name,
		uuid: site.uuid,
		id: site.id,
		branch: getSiteBranch(site),
		status: deriveStatus(builds.items[0], syncs.items[0]),
	};
}

function fieldValue(row: SiteStatusRow, field: TemplateField): string {
	if (field === 'id') {
		return String(row.id);
	}
	if (field === 'branch') {
		return row.branch ?? '';
	}
	return row[field];
}

export function compileTemplate(spec: string): (row: SiteStatusRow) => string {
	type Part = { type: 'text'; value: string } | { type: 'field'; value: TemplateField };
	const parts: Part[] = [];
	let i = 0;
	while (i < spec.length) {
		if (spec.startsWith('{{', i)) {
			parts.push({ type: 'text', value: '{' });
			i += 2;
			continue;
		}
		if (spec.startsWith('}}', i)) {
			parts.push({ type: 'text', value: '}' });
			i += 2;
			continue;
		}
		if (spec[i] === '{') {
			const end = spec.indexOf('}', i + 1);
			if (end === -1) {
				throw new Error(`Unclosed placeholder in --format template near "${spec.slice(i)}".`);
			}
			const token = spec.slice(i + 1, end);
			if (!(TEMPLATE_FIELDS as readonly string[]).includes(token)) {
				throw new Error(
					`Unknown --format placeholder "{${token}}". Expected one of: ${TEMPLATE_FIELDS.map((f) => `{${f}}`).join(', ')}.`
				);
			}
			parts.push({ type: 'field', value: token as TemplateField });
			i = end + 1;
			continue;
		}
		if (spec[i] === '}') {
			throw new Error('Unexpected "}" in --format template. Use "}}" for a literal closing brace.');
		}
		const nextBrace = spec.indexOf('{', i);
		const nextClose = spec.indexOf('}', i);
		let next = spec.length;
		if (nextBrace !== -1) {
			next = Math.min(next, nextBrace);
		}
		if (nextClose !== -1) {
			next = Math.min(next, nextClose);
		}
		parts.push({ type: 'text', value: spec.slice(i, next) });
		i = next;
	}

	return (row: SiteStatusRow): string =>
		parts.map((part) => (part.type === 'text' ? part.value : fieldValue(row, part.value))).join('');
}

export function resolveFormat(spec: string | undefined): ResolvedFormat {
	if (spec === undefined) {
		return { kind: 'json' };
	}
	if (FORMAT_PRESETS.has(spec as FormatPreset)) {
		return { kind: 'preset', name: spec as FormatPreset };
	}
	return { kind: 'template', render: compileTemplate(spec) };
}

export function formatLines(rows: SiteStatusRow[]): string[] {
	const nameCounts = new Map<string, number>();
	for (const row of rows) {
		nameCounts.set(row.site_name, (nameCounts.get(row.site_name) ?? 0) + 1);
	}

	return rows.map((row) => {
		const needsDisambiguation = (nameCounts.get(row.site_name) ?? 0) > 1;
		const label =
			needsDisambiguation && row.branch ? `${row.site_name} (${row.branch})` : row.site_name;
		return `${label}: ${row.status}`;
	});
}

export function formatTable(rows: SiteStatusRow[]): string[] {
	const headers = ['SITE_NAME', 'BRANCH', 'STATUS'] as const;
	const body = rows.map((row) => [row.site_name, row.branch ?? '', row.status]);
	const widths = headers.map((header, col) =>
		Math.max(header.length, ...body.map((line) => line[col].length))
	);

	const pad = (cells: string[]): string =>
		cells.map((cell, col) => cell.padEnd(widths[col])).join('  ');

	return [pad([...headers]), ...body.map(pad)];
}

function csvEscape(value: string): string {
	if (/[",\n\r]/.test(value)) {
		return `"${value.replaceAll('"', '""')}"`;
	}
	return value;
}

export function formatCsv(rows: SiteStatusRow[]): string[] {
	const header = ['site_name', 'uuid', 'id', 'branch', 'status'].join(',');
	const lines = rows.map((row) =>
		[
			csvEscape(row.site_name),
			csvEscape(row.uuid),
			csvEscape(String(row.id)),
			csvEscape(row.branch ?? ''),
			csvEscape(row.status),
		].join(',')
	);
	return [header, ...lines];
}

export function formatRows(rows: SiteStatusRow[], format: ResolvedFormat): string[] | null {
	if (format.kind === 'json') {
		return null;
	}
	if (format.kind === 'template') {
		return rows.map((row) => format.render(row));
	}
	if (format.name === 'lines') {
		return formatLines(rows);
	}
	if (format.name === 'table') {
		return formatTable(rows);
	}
	return formatCsv(rows);
}

function sortRows(rows: SiteStatusRow[]): SiteStatusRow[] {
	return [...rows].sort((a, b) => {
		const byName = a.site_name.localeCompare(b.site_name);
		if (byName !== 0) {
			return byName;
		}
		return (a.branch ?? '').localeCompare(b.branch ?? '');
	});
}

function renderRows(rows: SiteStatusRow[], format: ResolvedFormat): void {
	const lines = formatRows(rows, format);
	if (lines === null) {
		printJson(rows);
		return;
	}
	for (const line of lines) {
		console.log(line);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectStatusRows(
	client: CloudCannonClient,
	sites: Site[]
): Promise<SiteStatusRow[]> {
	const rows = await mapPool(sites, CONCURRENCY, (site) => fetchSiteStatus(client, site));
	return sortRows(rows);
}

export const sitesStatusCommand = defineCommand({
	meta: {
		name: 'status',
		description: 'Show the latest sync/build status for sites.',
	},
	args: {
		branch: {
			type: 'string',
			description: 'Only include sites syncing from this git branch',
			valueHint: 'name',
		},
		match: {
			type: 'string',
			description: 'Regex filter against site name, uuid, id, domain, or branch',
			valueHint: 'regex',
		},
		org: {
			type: 'string',
			description: 'Limit to one Organization by name, ID, or UUID',
			valueHint: 'name|id|uuid',
		},
		format: {
			type: 'string',
			description:
				'Output format: omit for JSON, or use lines|table|csv, or a template like {site_name}: {status}',
			valueHint: 'preset|template',
		},
		watch: {
			type: 'boolean',
			description: 'Refresh the filtered status list until interrupted',
			default: false,
		},
		interval: {
			type: 'string',
			description: 'Watch refresh interval in seconds',
			valueHint: 'seconds',
			default: String(DEFAULT_WATCH_INTERVAL_SECONDS),
		},
	},
	async run(ctx): Promise<void> {
		const branch = typeof ctx.args.branch === 'string' ? ctx.args.branch : undefined;
		const matchArg = typeof ctx.args.match === 'string' ? ctx.args.match : undefined;
		const orgArg = typeof ctx.args.org === 'string' ? ctx.args.org : undefined;
		const formatArg = typeof ctx.args.format === 'string' ? ctx.args.format : undefined;
		const watch = Boolean(ctx.args.watch);
		const intervalSeconds = Number(ctx.args.interval);

		if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
			console.error('--interval must be a positive number of seconds.');
			process.exitCode = 1;
			return;
		}

		let format: ResolvedFormat;
		try {
			format = resolveFormat(formatArg);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			console.error(message);
			process.exitCode = 1;
			return;
		}

		let match: RegExp | undefined;
		if (matchArg !== undefined) {
			try {
				match = new RegExp(matchArg, 'i');
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				console.error(`Invalid --match regex: ${message}`);
				process.exitCode = 1;
				return;
			}
		}

		const client = await getSdkClient();

		let orgUuid: string | undefined;
		if (orgArg !== undefined) {
			const org = await resolveOrg(client, orgArg);
			if (!org?.uuid) {
				process.exitCode = 1;
				return;
			}
			orgUuid = org.uuid;
		}

		const runOnce = async (): Promise<boolean> => {
			try {
				const sites = (await listSites(client, orgUuid)).filter((site) =>
					matchesFilters(site, { branch, match })
				);
				const rows = await collectStatusRows(client, sites);
				if (watch) {
					console.clear();
				}
				renderRows(rows, format);
				return true;
			} catch (err: unknown) {
				handleAPIError(err);
				process.exitCode = 1;
				return false;
			}
		};

		const ok = await runOnce();
		if (!ok || !watch) {
			return;
		}

		const intervalMs = intervalSeconds * 1000;
		while (true) {
			await sleep(intervalMs);
			const refreshed = await runOnce();
			if (!refreshed) {
				return;
			}
		}
	},
});
