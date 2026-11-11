import * as p from '@clack/prompts';
import type CloudCannonClient from '@cloudcannon/sdk';
import type { BaseDomain, Site } from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { exitOnCancel, listAllPages, promptOrg, text as styleText } from '../configure/utility.ts';
import { getSdkClient, handleAPIError } from '../sdk-client.ts';

function fromMatchesAllRoutes(glob: unknown): boolean {
	if (typeof glob !== 'string') {
		return false;
	}

	const normalized = glob.replace(/^\//, '');

	return !!normalized.match(/^\(\.\*\??\)$/);
}

function getValidRedirectLocation(to: unknown): string | undefined {
	if (typeof to !== 'string') {
		return;
	}

	let toURL: URL;
	try {
		toURL = new URL(to);
	} catch {
		return;
	}
	if (
		toURL.pathname !== '/$1' ||
		toURL.hash.length ||
		toURL.search.length ||
		toURL.username.length ||
		toURL.password.length ||
		toURL.port.length
	) {
		return;
	}
	return toURL.host;
}

type RedirectCode = 301 | 302 | 307 | 308 | undefined;
function statusIsSupportedRedirect(status: unknown): status is RedirectCode {
	return (
		(typeof status === 'number' && [301, 302, 307, 308].includes(status)) || status === undefined
	);
}

interface MigrationItem {
	site: Site;
	domain: BaseDomain;
	redirectLocation: string;
	redirectStatus: RedirectCode;
}

function siteBelongsToBaseDomain(site: Site, baseDomain: string): boolean {
	const domainName = site.domain_name?.toLowerCase();
	const base = baseDomain.toLowerCase();
	return domainName !== undefined && (domainName === base || domainName.endsWith(`.${base}`));
}

async function confirmItemsToMigrate(items: MigrationItem[]): Promise<MigrationItem[]> {
	if (items.length === 1) {
		const { site, redirectLocation } = items[0];
		if (site.domain_name) {
			const confirm = await p.confirm({
				message: `Convert ${site.domain_name} to a Redirect Subdomain, pointing to ${redirectLocation}`,
				initialValue: true,
			});
			exitOnCancel(confirm);
			return confirm ? items : [];
		}
	}
	if (items.length) {
		const selected = await p.multiselect({
			message: `The following ${items.length} Subdomains could be converted from Site Subdomains to Redirect Subdomains. Select the ones to convert:`,
			options: [
				...items.map((item, index) => {
					return {
						label: `${item.site.domain_name} ${styleText.secondary(`redirects to ${item.redirectLocation}`)}`,
						value: index,
					};
				}),
			],
			maxItems: 8,
		});
		exitOnCancel(selected);
		return items.filter((_item, index) => selected.includes(index));
	}

	return [];
}

async function siteRedirectLocation(
	site: Site,
	client: CloudCannonClient
): Promise<{ to: string; status: RedirectCode } | undefined> {
	const siteClient = client.site(site.uuid);
	const siteLabel = site.domain_name ?? site.uuid;
	try {
		const fileResp = await siteClient.getFile('.cloudcannon/routing.json').catch((resp) => {
			if (resp.status !== 404) {
				console.error(
					styleText.secondary(
						`${siteLabel}: could not read .cloudcannon/routing.json. (${resp.status})`
					)
				);
			}
			return;
		});
		if (!fileResp?.ok) {
			return;
		}
		const routingFile: unknown = await fileResp.json();
		if (!routingFile || typeof routingFile !== 'object') {
			return;
		}
		if (
			'headers' in routingFile &&
			Array.isArray(routingFile.headers) &&
			routingFile.headers.length > 0
		) {
			return;
		}
		if (
			!('routes' in routingFile) ||
			!Array.isArray(routingFile.routes) ||
			routingFile.routes.length !== 1
		) {
			return;
		}
		const route = routingFile.routes[0];
		if (!route || typeof route !== 'object') {
			return;
		}
		const { from, to, status, substitutions, forced } = route as Record<string, unknown>;
		const routeStatus = Number(status) || undefined;
		if (
			!fromMatchesAllRoutes(from) ||
			substitutions === false ||
			forced === false ||
			!statusIsSupportedRedirect(routeStatus)
		) {
			return;
		}
		const toUrl = getValidRedirectLocation(to);
		if (!toUrl) {
			return;
		}
		return { to: toUrl, status: routeStatus };
	} catch (err: unknown) {
		console.error(
			styleText.secondary(`${siteLabel}: ${err instanceof Error ? err.message : String(err)}`)
		);
	}
}

const migrateRedirectSitesToSubdomainsCommand = defineCommand({
	meta: {
		name: 'convert-redirect-sites-to-subdomains',
		description:
			'Convert Site Subdomains whose routing.json redirects all traffic into Redirect Subdomains.',
	},
	args: {
		org: {
			type: 'string',
			description: 'The Organization name, ID, or UUID',
			valueHint: 'name|id|uuid',
		},
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();

		const org = await promptOrg(client, ctx.args.org);
		if (!org) {
			process.exitCode = 1;
			return;
		}
		const orgClient = client.org(org.uuid);

		const spinner = p.spinner();
		spinner.start('Looking for Site Subdomains that can be changed into Redirect Subdomains...');

		const domains = await listAllPages((page) =>
			orgClient.domains({ page, filters: { uses_dns: false } })
		).catch((e) => {
			console.error(styleText.bad('An error occurred while searching your Domains.'));
			handleAPIError(e);
			process.exit(1);
		});

		const sites = await listAllPages((page) =>
			orgClient.sites({ page, filters: { has_domain_name: true, has_subpath: false } })
		).catch((e) => {
			console.error(styleText.bad('An error occurred while searching your Sites.'));
			handleAPIError(e);
			process.exit(1);
		});

		const migrationItems: MigrationItem[] = [];

		for (let i = 0; i < domains.length; i++) {
			const domain = domains[i];
			spinner.message(`Checking ${domain.base_domain} (${i + 1}/${domains.length})`);
			for (const site of sites) {
				if (!siteBelongsToBaseDomain(site, domain.base_domain)) {
					continue;
				}
				const redirect = await siteRedirectLocation(site, client);
				if (!redirect) {
					continue;
				}
				migrationItems.push({
					site,
					domain,
					redirectLocation: redirect.to,
					redirectStatus: redirect.status,
				});
			}
		}
		spinner.stop(`Found ${migrationItems.length} Subdomains that could be migrated.`);

		if (migrationItems.length === 0) {
			console.log(
				styleText.secondary(
					'\nNo Site Subdomains found that can be converted to Redirect Subdomains.'
				)
			);
			return;
		}

		const confirmedItems = await confirmItemsToMigrate(migrationItems);

		for (const item of confirmedItems) {
			const domainName = item.site.domain_name;
			try {
				if (!domainName) {
					continue;
				}
				const domainClient = client.domain(item.domain.uuid);
				const subdomain = (
					await domainClient.getSubdomains({
						filters: { search: domainName, serving_mode: 'site' },
					})
				).items.find((sub) => sub.domain_name === domainName);
				if (!subdomain) {
					process.exitCode = 1;
					console.error(styleText.bad(`Could not find a Site Subdomain for ${domainName}.`));
					continue;
				}
				if (subdomain.sites && subdomain.sites.length > 1) {
					process.exitCode = 1;
					console.error(
						styleText.bad(
							`${domainName} has multiple Sites attached and could not be automatically migrated.`
						)
					);
					continue;
				}
				await domainClient.subdomain(subdomain.uuid).changeToRedirect({
					redirect_target: item.redirectLocation,
					redirect_status: item.redirectStatus,
				});
				console.log(
					styleText.good(
						`Converted ${domainName} into a Redirect Subdomain pointing at ${item.redirectLocation}.`
					)
				);
			} catch (err: unknown) {
				process.exitCode = 1;
				console.error(styleText.bad(`Failed to convert ${domainName}.`));
				handleAPIError(err);
			}
		}
	},
});

export default migrateRedirectSitesToSubdomainsCommand;
