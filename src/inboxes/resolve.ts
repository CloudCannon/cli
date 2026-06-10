import type CloudCannonClient from '@cloudcannon/sdk';
import type { ListOrgInboxesOptions } from '@cloudcannon/sdk';
import { printJson } from '../configure/utility.ts';
import { handleAPIError } from '../sdk-client.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveInboxUuid(
	client: CloudCannonClient,
	identifier: string
): Promise<string | undefined> {
	if (UUID_REGEX.test(identifier)) {
		return identifier;
	}

	const filters: ListOrgInboxesOptions['filters'] = {};
	const idCandidate = Number(identifier);

	if (Number.isInteger(idCandidate) && idCandidate > 0) {
		filters.id = idCandidate;
	} else {
		filters.search = identifier;
	}

	try {
		const orgs = await client.orgs();
		for (const org of orgs.items) {
			const inboxes = await client.org(org.uuid).getInboxes({
				filters,
			});

			if (inboxes.items.length > 1) {
				console.error(`Inbox identifier "${identifier}" is ambiguous. Potential matches are:`);
				printJson(inboxes.items);
				return;
			}

			if (inboxes.items.length === 0) {
				console.error(`No inbox found matching "${identifier}".`);
				return;
			}

			return inboxes.items[0].uuid;
		}
	} catch (err: unknown) {
		handleAPIError(err);
		return;
	}
}
