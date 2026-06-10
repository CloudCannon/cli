import type CloudCannonClient from '@cloudcannon/sdk';
import type { ListOrgsOptions } from '@cloudcannon/sdk';
import { printJson } from '../configure/utility.ts';
import { handleAPIError } from '../sdk-client.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveOrgUuid(
	client: CloudCannonClient,
	identifier: string
): Promise<string | undefined> {
	if (UUID_REGEX.test(identifier)) {
		return identifier;
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
			console.error(`No organisation found matching "${identifier}".`);
			return;
		}

		return orgs.items[0].uuid;
	} catch (err: unknown) {
		handleAPIError(err);
		return;
	}
}
