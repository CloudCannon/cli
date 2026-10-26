import type CloudCannonClient from '@cloudcannon/sdk';
import type { Inbox, ListOrgInboxesOptions } from '@cloudcannon/sdk';
import { printErrorJson } from '../configure/utility.ts';
import { handleAPIError } from '../sdk-client.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const inboxArg = {
	inbox: {
		type: 'string',
		description: 'The inbox name, ID, key, or UUID',
		valueHint: 'name|id|key|uuid',
		required: true,
	},
} as const;

export async function resolveInboxUuid(
	client: CloudCannonClient,
	identifier: string
): Promise<string | undefined> {
	if (UUID_REGEX.test(identifier)) {
		return identifier;
	}

	const idCandidate = Number(identifier);
	const isId = Number.isInteger(idCandidate) && idCandidate > 0;

	try {
		const orgs = await client.orgs();
		const collect = async (filters: ListOrgInboxesOptions['filters']): Promise<Inbox[]> => {
			const found: Inbox[] = [];
			for (const org of orgs.items) {
				if (!org.uuid) {
					continue;
				}

				const inboxes = await client.org(org.uuid).getInboxes({ filters });
				found.push(...inboxes.items);
			}
			return found;
		};

		// An all-digits identifier is an ID first, but a key can be digits too, so a miss
		// falls back to the wider search rather than reporting nothing found.
		let candidateInboxes = await collect(isId ? { id: idCandidate } : { search: identifier });
		if (isId && candidateInboxes.length === 0) {
			candidateInboxes = await collect({ search: identifier });
		}

		if (candidateInboxes.length > 1) {
			console.error(`Inbox identifier "${identifier}" is ambiguous. Potential matches are:`);
			printErrorJson(candidateInboxes);
			return;
		}

		if (candidateInboxes.length === 0) {
			console.error(`No inbox found matching "${identifier}".`);
			return;
		}

		return candidateInboxes[0].uuid;
	} catch (err: unknown) {
		handleAPIError(err);
		return;
	}
}
