import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Writable } from 'node:stream';
import type CloudCannonClient from '@cloudcannon/sdk';
import type { EditingSession, EditingSessionFile } from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { printJson } from '../configure/utility.ts';
import { getSdkClient, handleAPIError } from '../sdk-client.ts';
import { resolveSiteUuid } from './resolve.ts';

export const sitesFilesListCommand = defineCommand({
	meta: {
		name: 'list',
		description: 'List files from a site.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site name, ID, UUID, or domain',
			valueHint: 'name|id|uuid|domain',
			required: true,
		},
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			return;
		}
		try {
			const files = await client.site(siteUuid).listFiles();
			const output = Object.fromEntries(files.map((file) => [file.sitePath, file.md5]));
			printJson(output);
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const sitesFilesGetCommand = defineCommand({
	meta: {
		name: 'get',
		description: 'Get the contents of a file from a site.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site name, ID, UUID, or domain',
			valueHint: 'name|id|uuid|domain',
			required: true,
		},
		output: {
			type: 'string',
			description: 'Path to save the file to',
			valueHint: 'path',
		},
		path: {
			type: 'positional',
			description: 'The file path on the site',
			required: true,
		},
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}
		try {
			const resp = await client.site(siteUuid).getFile(ctx.args.path);
			if (ctx.args.output) {
				const stream = createWriteStream(ctx.args.output);
				await resp.body?.pipeTo(Writable.toWeb(stream));
			} else {
				const text = await resp.text();
				console.log(text);
			}
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const sitesFilesUploadCommand = defineCommand({
	meta: {
		name: 'upload',
		description: 'Upload a file to a site.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site name, ID, UUID, or domain',
			valueHint: 'name|id|uuid|domain',
			required: true,
		},
		localPath: {
			type: 'positional',
			description: 'The local file path to upload',
			required: true,
		},
		path: {
			type: 'positional',
			description: 'The destination path on the site',
			required: true,
		},
		type: {
			type: 'string',
			description: 'MIME type of the file',
			valueHint: 'mime',
		},
		'allow-overwrite': {
			type: 'boolean',
			description: 'Overwrite the destination if it already exists',
			default: false,
		},
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const content = await readFile(ctx.args.localPath);
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}
		try {
			await client.site(siteUuid).uploadFile(ctx.args.path, content, {
				type: ctx.args.type,
				allow_overwrite: !!ctx.args.allowOverwrite,
			});
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

async function resolveEditingSession(
	client: CloudCannonClient,
	siteUuid: string
): Promise<EditingSession | undefined> {
	try {
		const session = await client.site(siteUuid).createEditingSession();
		return session;
	} catch (err: unknown) {
		handleAPIError(err);
		process.exitCode = 1;
	}
}

function normalizePath(path: string): string {
	const stripped = path.replace(/^\.\//, '');
	return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

function collectPaths(ctx: { args: { target?: string; _: string[] } }): string[] {
	const paths: string[] = [];
	for (const extra of ctx.args._) {
		if (typeof extra === 'string') {
			paths.push(normalizePath(extra));
		}
	}
	return paths;
}

export const sitesFilesMoveCommand = defineCommand({
	meta: {
		name: 'move',
		description: 'Move a file within a site editing session.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site name, ID, UUID, or domain',
			valueHint: 'name|id|uuid|domain',
			required: true,
		},
		src: {
			type: 'positional',
			description: 'The source path on the site',
			required: true,
		},
		dest: {
			type: 'positional',
			description: 'The destination path on the site',
			required: true,
		},
		'allow-overwrite': {
			type: 'boolean',
			description: 'Overwrite the destination if it already exists',
			default: false,
		},
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}
		const session = await resolveEditingSession(client, siteUuid);
		if (!session) {
			process.exitCode = 1;
			return;
		}
		try {
			await client.editingSession(session.uuid).moveFile({
				source: ctx.args.src,
				target: ctx.args.dest,
				allow_overwrite: !!ctx.args.allowOverwrite,
			});
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const sitesFilesCloneCommand = defineCommand({
	meta: {
		name: 'clone',
		description: 'Clone a file within a site editing session.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site name, ID, UUID, or domain',
			valueHint: 'name|id|uuid|domain',
			required: true,
		},
		src: {
			type: 'positional',
			description: 'The source path on the site',
			required: true,
		},
		dest: {
			type: 'positional',
			description: 'The destination path on the site',
			required: true,
		},
		'allow-overwrite': {
			type: 'boolean',
			description: 'Overwrite the destination if it already exists',
			default: false,
		},
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}
		const session = await resolveEditingSession(client, siteUuid);
		if (!session) {
			process.exitCode = 1;
			return;
		}
		try {
			await client.editingSession(session.uuid).cloneFile({
				source: ctx.args.src,
				target: ctx.args.dest,
				allow_overwrite: !!ctx.args.allowOverwrite,
			});
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const sitesFilesDeleteCommand = defineCommand({
	meta: {
		name: 'delete',
		description: 'Delete one or more files within a site editing session.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site name, ID, UUID, or domain',
			valueHint: 'name|id|uuid|domain',
			required: true,
		},
		target: {
			type: 'positional',
			description: 'The path on the site to delete (additional paths accepted as positional args)',
			required: true,
		},
		'discard-unsaved': {
			type: 'boolean',
			description: 'Discard any unsaved edits to the files',
			default: false,
		},
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}
		const session = await resolveEditingSession(client, siteUuid);
		if (!session) {
			process.exitCode = 1;
			return;
		}
		const targets = collectPaths(ctx);
		try {
			await client.editingSession(session.uuid).deleteFiles({
				paths: targets.map((target) => ({ target })),
				discard_unsaved: !!ctx.args.discardUnsaved,
			});
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const sitesFilesRestoreCommand = defineCommand({
	meta: {
		name: 'restore',
		description: 'Restore one or more deleted files within a site editing session.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site name, ID, UUID, or domain',
			valueHint: 'name|id|uuid|domain',
			required: true,
		},
		target: {
			type: 'positional',
			description: 'The path on the site to restore (additional paths accepted as positional args)',
			required: true,
		},
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}
		const session = await resolveEditingSession(client, siteUuid);
		if (!session) {
			process.exitCode = 1;
			return;
		}
		const targets = collectPaths(ctx);
		try {
			await client
				.editingSession(session.uuid)
				.restoreFiles({ paths: targets.map((target) => ({ target })) });
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const sitesFilesListEditsCommand = defineCommand({
	meta: {
		name: 'list-edits',
		description: 'List pending edits on a site editing session.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site name, ID, UUID, or domain',
			valueHint: 'name|id|uuid|domain',
			required: true,
		},
		verbose: {
			type: 'boolean',
			description: 'Print the full objects returned by the API',
			default: false,
		},
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}
		const session = await client.site(siteUuid).getLatestEditingSession();
		if (!session?.uuid) {
			console.log('No pending edits');
			return;
		}
		try {
			const files: EditingSessionFile[] = await client.editingSession(session.uuid).getFiles();
			if (files.length === 0) {
				console.log('No pending edits');
				return;
			}
			if (ctx.args.verbose) {
				printJson(files);
			} else {
				const siteFiles = await client.site(siteUuid).listFiles();
				const existingPaths = new Set(siteFiles.map((file) => file.sitePath));
				const output = Object.fromEntries(
					files.map((file) => {
						const key = file.path ?? file.source_path;
						const status = key && existingPaths.has(key) ? file.edit_type : 'new';
						return [key, status];
					})
				);
				printJson(output);
			}
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const sitesFilesCommitCommand = defineCommand({
	meta: {
		name: 'commit',
		description: 'Commit a site editing session, pushing changes to the repository.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site name, ID, UUID, or domain',
			valueHint: 'name|id|uuid|domain',
			required: true,
		},
		path: {
			type: 'positional',
			description:
				'Paths of session files to commit (additional paths accepted as positional args)',
			required: false,
		},
		all: {
			type: 'boolean',
			description: 'Commit all files in the editing session',
			default: false,
		},
		message: {
			type: 'string',
			description: 'Commit message',
			valueHint: 'msg',
		},
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}
		const session = await resolveEditingSession(client, siteUuid);
		if (!session) {
			process.exitCode = 1;
			return;
		}

		const paths: string[] = collectPaths(ctx);

		const sessionClient = client.editingSession(session.uuid);
		if (!ctx.args.all && paths.length === 0) {
			process.exitCode = 1;
			console.error(
				'Error: you must either provide a list of files to commit or use the --all flag'
			);
			return;
		}

		try {
			const files: EditingSessionFile[] = await sessionClient.getFiles();
			if (files.length === 0) {
				process.exitCode = 1;
				console.error('Site has no pending edits to commit');
				return;
			}

			if (ctx.args.all) {
				await sessionClient.commit(ctx.args.message ? { message: ctx.args.message } : undefined);
				console.log(`Successfully committed ${files.length} file${files.length === 1 ? '' : 's'}`);
				return;
			}

			const pathToUuid = new Map<string, string>();
			for (const file of files) {
				const key = file.path ?? file.source_path;
				if (key && file.uuid) {
					pathToUuid.set(key, file.uuid);
				}
			}

			const missing: string[] = [];
			const include: Record<string, boolean> = {};
			for (const path of paths) {
				const uuid = pathToUuid.get(path);
				if (!uuid) {
					missing.push(path);
				} else {
					include[uuid] = true;
				}
			}

			if (missing.length > 0) {
				console.error(
					`No session files found for path(s): ${missing.join(', ')}. Run \`cloudcannon sites files list-edits --site ${ctx.args.site}\` to see pending edits.`
				);
				process.exitCode = 1;
				return;
			}

			await sessionClient.commit({
				...(ctx.args.message ? { message: ctx.args.message } : {}),
				include,
			});
			console.log(`Successfully committed ${paths.length} file${paths.length === 1 ? '' : 's'}`);
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const sitesFilesDiscardCommand = defineCommand({
	meta: {
		name: 'discard',
		description:
			'Discard one or more session files from a site editing session, dropping their pending edits.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site name, ID, UUID, or domain',
			valueHint: 'name|id|uuid|domain',
			required: true,
		},
		target: {
			type: 'positional',
			description:
				'The path of a session file to discard (additional paths accepted as positional args)',
			required: true,
		},
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}
		const session = await resolveEditingSession(client, siteUuid);
		if (!session) {
			process.exitCode = 1;
			return;
		}
		const paths = collectPaths(ctx);
		const sessionClient = client.editingSession(session.uuid);
		try {
			const files: EditingSessionFile[] = await sessionClient.getFiles();
			const pathToUuid = new Map<string, string>();
			for (const file of files) {
				const key = file.path ?? file.source_path;
				if (key && file.uuid) {
					pathToUuid.set(key, file.uuid);
				}
			}

			const missing: string[] = [];
			for (const path of paths) {
				const uuid = pathToUuid.get(path);
				if (!uuid) {
					missing.push(path);
					continue;
				}
				await client.editingSessionFile(uuid).discard();
				console.log(`Discarded ${path}`);
			}

			if (missing.length > 0) {
				console.error(
					`No session files found for path(s): ${missing.join(', ')}. Run \`cloudcannon sites files list-edits --site ${ctx.args.site}\` to see pending edits.`
				);
				process.exitCode = 1;
			} else if (paths.length === 0 && missing.length === 0) {
				console.error('Nothing to discard');
			}
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const sitesFilesCommand = defineCommand({
	meta: {
		name: 'files',
		description: 'Manage files on a CloudCannon site.',
	},
	subCommands: {
		list: sitesFilesListCommand,
		get: sitesFilesGetCommand,
		upload: sitesFilesUploadCommand,
		move: sitesFilesMoveCommand,
		clone: sitesFilesCloneCommand,
		delete: sitesFilesDeleteCommand,
		restore: sitesFilesRestoreCommand,
		discard: sitesFilesDiscardCommand,
		'list-edits': sitesFilesListEditsCommand,
		commit: sitesFilesCommitCommand,
	},
});
