import type CloudCannonClient from '@cloudcannon/sdk';
import type { ListOrgsOptions, Org } from '@cloudcannon/sdk';
import { printJson } from '../configure/utility.ts';
import { handleAPIError } from '../sdk-client.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveOrg(
	client: CloudCannonClient,
	identifier?: string
): Promise<Org | undefined> {
	if (!identifier) {
		try {
			const orgs = await client.orgs();
			if (orgs.items.length === 1) {
				return orgs.items[0];
			}
			return;
		} catch (err: unknown) {
			handleAPIError(err);
			return;
		}
	}

	if (UUID_REGEX.test(identifier)) {
		try {
			return await client.org(identifier).get();
		} catch (err: unknown) {
			handleAPIError(err);
			return;
		}
	}

	const filters: ListOrgsOptions['filters'] = {};
	const idCandidate = Number(identifier);

	if (Number.isInteger(idCandidate) && idCandidate > 0) {
		filters.id = idCandidate;
	} else {
		filters.search = identifier;
	}

	try {
		const orgs = await client.orgs({ filters });

		if (orgs.items.length > 1) {
			console.error(`Org identifier "${identifier}" is ambiguous. Potential matches are:`);
			printJson(orgs.items);
			return;
		}

		if (orgs.items.length === 0) {
			console.error(`No organization found matching "${identifier}".`);
			return;
		}

		return orgs.items[0];
	} catch (err: unknown) {
		handleAPIError(err);
		return;
	}
}
