import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Writable } from 'node:stream';
import { defineCommand } from 'citty';
import { printJson } from '../configure/utility.ts';
import { getSdkClient } from '../sdk-client.ts';
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
		const client = getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			return;
		}
		const files = await client.site(siteUuid).listFiles();
		const output = Object.fromEntries(files.map((file) => [file.sitePath, file.md5]));
		printJson(output);
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
		const client = getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}
		const resp = await client.site(siteUuid).getFile(ctx.args.path);
		if (ctx.args.output) {
			const stream = createWriteStream(ctx.args.output);
			await resp.body?.pipeTo(Writable.toWeb(stream));
		} else {
			const text = await resp.text();
			console.log(text);
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
		overwrite: {
			type: 'boolean',
			description: 'Overwrite if the file already exists',
			default: false,
		},
	},
	async run(ctx): Promise<void> {
		const client = getSdkClient();
		const content = await readFile(ctx.args.localPath);
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}
		await client.site(siteUuid).uploadFile(ctx.args.path, content, {
			type: ctx.args.type,
			overwriteExistingFile: ctx.args.overwrite,
		});
		console.log('File uploaded.');
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
	},
});
