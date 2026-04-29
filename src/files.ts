import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Writable } from 'node:stream';
import { defineCommand } from 'citty';
import { getSdkClient } from './sdk-client.ts';

export const filesListCommand = defineCommand({
	meta: {
		name: 'list',
		description: 'List files from a site.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site UUID',
			valueHint: 'uuid',
			required: true,
		},
	},
	async run(ctx): Promise<void> {
		const client = getSdkClient();
		const files = await client.site(ctx.args.site).listFiles();
		const output = Object.fromEntries(
			files.map((file) => [file.sitePath, file.md5])
		);
		console.log(JSON.stringify(output, null, 2));
	},
});

export const filesGetCommand = defineCommand({
	meta: {
		name: 'get',
		description: 'Get the contents of a file from a site.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site UUID',
			valueHint: 'uuid',
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
		const resp = await client.site(ctx.args.site).getFile(ctx.args.path);
		if (ctx.args.output) {
			const stream = createWriteStream(ctx.args.output);
			await resp.body?.pipeTo(Writable.toWeb(stream));
		} else {
			const text = await resp.text();
			console.log(text);
		}
	},
});

export const filesUploadCommand = defineCommand({
	meta: {
		name: 'upload',
		description: 'Upload a file to a site.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site UUID',
			valueHint: 'uuid',
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
		await client.site(ctx.args.site).uploadFile(ctx.args.path, content, {
			type: ctx.args.type,
			overwriteExistingFile: ctx.args.overwrite,
		});
		console.log('File uploaded.');
	},
});

export const filesCommand = defineCommand({
	meta: {
		name: 'files',
		description: 'Manage files on CloudCannon sites.',
	},
	subCommands: {
		list: filesListCommand,
		get: filesGetCommand,
		upload: filesUploadCommand,
	},
});
