import { execFile } from 'node:child_process';
import { basename } from 'node:path';
import { promisify } from 'node:util';
import * as p from '@clack/prompts';
import type CloudCannonClient from '@cloudcannon/sdk';
import type { Org, Provider } from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { exitOnCancel, text } from '../configure/utility.ts';
import { resolveOrg } from '../orgs/resolve.ts';
import { getSdkClient, handleAPIError } from '../sdk-client.ts';

const execFileAsync = promisify(execFile);

const PROVIDER_HOSTS: Record<string, Provider> = {
	'github.com': 'github',
	'gitlab.com': 'gitlab',
	'bitbucket.org': 'bitbucket',
};

interface ParsedSource {
	provider: Provider;
	repository: string;
	branch?: string;
}

export function parseSourceUrl(raw: string): ParsedSource | undefined {
	// Normalize SCP-style SSH (git@host:path or git@host/path) to ssh://git@host/path
	const normalized = raw
		.trim()
		.replace(/^git@([^:]+):(.+)$/, 'ssh://git@$1/$2')
		.replace(/^git@([^/]+)\/(.+)$/, 'ssh://git@$1/$2');

	let url: URL;
	try {
		url = new URL(normalized);
	} catch {
		return undefined;
	}

	const provider = PROVIDER_HOSTS[url.host];
	if (!provider) {
		return undefined;
	}

	// pathname: /owner/repo.git -> owner/repo
	const path = url.pathname
		.replace(/^\/+/, '')
		.replace(/\/+$/, '')
		.replace(/\.git$/, '');
	const parts = path.split('/');
	if (parts.length < 2) {
		return undefined;
	}

	const repository = parts.slice(-2).join('/');
	const branch = url.hash ? url.hash.slice(1) || undefined : undefined;

	return { provider, repository, branch };
}

async function getLocalGitRemote(): Promise<string | undefined> {
	try {
		const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin']);
		return stdout.trim() || undefined;
	} catch {
		return undefined;
	}
}

async function getLocalGitBranch(): Promise<string | undefined> {
	try {
		const { stdout } = await execFileAsync('git', ['branch', '--show-current']);
		return stdout.trim() || undefined;
	} catch {
		return undefined;
	}
}

async function promptOrg(client: CloudCannonClient, prefilled?: string): Promise<Org | undefined> {
	const resolved = await resolveOrg(client, prefilled);
	if (resolved) {
		return resolved;
	}

	if (typeof prefilled === 'string') {
		process.exitCode = 1;
		return;
	}

	try {
		const orgs = await client.orgs();
		if (orgs.items.length === 0) {
			console.error('No organizations found for this account.');
			return;
		}

		const options = orgs.items.map((org) => ({
			value: org.uuid,
			label: org.name ?? org.uuid,
		}));

		const choice = await p.select({
			message: 'Select an organisation:',
			options,
		});
		exitOnCancel(choice);

		const selected = orgs.items.find((org) => org.uuid === choice);
		return selected;
	} catch (err: unknown) {
		handleAPIError(err);
		return;
	}
}

export const sitesCreateCommand = defineCommand({
	meta: {
		name: 'create',
		description: 'Create a new site connected to a git repository.',
	},
	args: {
		source: {
			type: 'positional',
			description: 'Git remote URL with optional #branch suffix',
			valueHint: 'url[#branch]',
			required: false,
		},
		org: {
			type: 'string',
			description: 'The organisation name, ID, or UUID',
			valueHint: 'name|id|uuid',
		},
		name: {
			type: 'string',
			description: 'The site name',
			valueHint: 'name',
		},
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();

		const org = await promptOrg(client, ctx.args.org);
		if (!org) {
			process.exitCode = 1;
			return;
		}

		const defaultRemote = await getLocalGitRemote();

		let defaultParsed: ParsedSource | undefined = ctx.args.source
			? parseSourceUrl(ctx.args.source)
			: undefined;
		defaultParsed ??= defaultRemote ? parseSourceUrl(defaultRemote) : undefined;

		let siteName: string;
		if (ctx.args.name) {
			siteName = ctx.args.name;
		} else {
			const defaultName = defaultParsed?.repository.split('/')[1] ?? basename(process.cwd());
			const nameInput = await p.text({
				message: 'Site name:',
				placeholder: defaultName,
				defaultValue: defaultName,
			});
			exitOnCancel(nameInput);
			siteName = nameInput;
		}

		let source: ParsedSource | undefined;
		if (ctx.args.source) {
			source = parseSourceUrl(ctx.args.source);
			if (!source) {
				console.error(
					text.bad(
						`Could not parse "${ctx.args.source}".\n` +
							'Supported hosts: github.com, gitlab.com, bitbucket.org.\n' +
							'Expected formats: https://github.com/owner/repo.git#branch or git@github.com:owner/repo.git#branch'
					)
				);
				process.exitCode = 1;
				return;
			}
		} else {
			const sourceInput = await p.text({
				message: 'Enter the git remote URL for your site:',
				placeholder: defaultRemote ?? 'https://github.com/owner/repo.git#main',
				defaultValue: defaultRemote ?? '',
			});
			exitOnCancel(sourceInput);

			source = parseSourceUrl(sourceInput);
			if (!source) {
				console.error(
					text.bad(
						`Could not parse "${sourceInput}".\n` +
							'Supported hosts: github.com, gitlab.com, bitbucket.org.\n' +
							'Expected formats: https://github.com/owner/repo.git#branch or git@github.com:owner/repo.git#branch'
					)
				);
				process.exitCode = 1;
				return;
			}
		}

		let branch = source?.branch;
		if (!branch) {
			const defaultBranch = (await getLocalGitBranch()) ?? 'main';
			const branchInput = await p.text({
				message: 'Branch:',
				defaultValue: defaultBranch,
				placeholder: defaultBranch,
			});
			exitOnCancel(branchInput);
			branch = branchInput;
		}

		try {
			const created = await client.org(org.uuid).createSite(siteName);
			if (!created.uuid) {
				console.error(text.bad('Site was created but no UUID was returned.'));
				process.exitCode = 1;
				return;
			}

			const site = await client.site(created.uuid).connectSourceProvider({
				provider: source.provider,
				repository: source.repository,
				branch,
			});

			console.log(text.good(`Site "${siteName}" created successfully.`));
			const appUrl = `https://app.cloudcannon.com/${org.id}/editor#sites/${site.id}`;
			console.log(`Open in CloudCannon: ${text.em(appUrl)}`);
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});
