import type CloudCannonClient from '@cloudcannon/sdk';

const STABLE_DOMAIN_SUFFIX = '.cloudvent.net';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveSiteUuid(
	client: CloudCannonClient,
	identifier: string
): Promise<string | undefined> {
	if (UUID_REGEX.test(identifier)) {
		return identifier;
	}

	const filters: NonNullable<Parameters<ReturnType<typeof client.org>['sites']>[0]>['filters'] = {};
	if (identifier.endsWith(STABLE_DOMAIN_SUFFIX)) {
		filters.search = identifier.split('.')[0] + STABLE_DOMAIN_SUFFIX;
	} else {
		filters.domain_name = identifier;
	}

	const orgs = await client.orgs();
	for (const org of orgs.items) {
		if (!org.uuid) {
			continue;
		}
		const sites = await client.org(org.uuid).sites({
			filters,
			items: 1,
		});
		const match = sites.items[0];
		if (match?.stable_domain === identifier || match?.domain_name === identifier) {
			return match.uuid;
		}
	}

	console.error(`No site found matching domain "${identifier}".`);
	return undefined;
}
