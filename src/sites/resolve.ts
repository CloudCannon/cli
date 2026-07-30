import type CloudCannonClient from '@cloudcannon/sdk';
import type { ListOrgSitesOptions } from '@cloudcannon/sdk';
import { printJson } from '../configure/utility.ts';
import { handleAPIError } from '../sdk-client.ts';

const STABLE_DOMAIN_SUFFIX = '.cloudvent.net';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveSiteUuid(
	client: CloudCannonClient,
	identifier: string
): Promise<string | undefined> {
	if (UUID_REGEX.test(identifier)) {
		return identifier;
	}

	const filters: ListOrgSitesOptions['filters'] = {};
	const idCandidate = Number(identifier);

	if (Number.isInteger(idCandidate) && idCandidate > 0) {
		filters.id = idCandidate;
	} else if (identifier.endsWith(STABLE_DOMAIN_SUFFIX)) {
		filters.search = identifier.split('.')[0] + STABLE_DOMAIN_SUFFIX;
	} else {
		filters.search = identifier;
	}

	try {
		const candidateSites = [];
		const orgs = await client.orgs();
		for (const org of orgs.items) {
			if (!org.uuid) {
				continue;
			}
			const sites = await client.org(org.uuid).sites({
				filters,
			});

			candidateSites.push(...sites.items);
		}

		if (candidateSites.length > 1) {
			console.error(`Site identifier "${identifier}" is ambiguous. Potential matches are:`);
			printJson(candidateSites);
			return;
		}

		if (candidateSites.length === 0) {
			console.error(`No site found matching "${identifier}".`);
			return;
		}

		return candidateSites[0].uuid;
	} catch (err: unknown) {
		handleAPIError(err);
		return;
	}
}
