import { resolve } from 'node:path';
import { generateConfiguration } from '@cloudcannon/gadget';
import { type CommandContext, defineCommand } from 'citty';
import {
	checkSsg,
	getFilePaths,
	pathArg,
	printJson,
	readFileFn,
	sourceArg,
	ssgArg,
} from './utility.ts';

export const detectCollectionsCommand = defineCommand({
	meta: {
		name: 'detect-collections',
		description: 'List detected collections.',
	},
	args: {
		...pathArg,
		...sourceArg,
		...ssgArg,
	},
	async run(ctx: CommandContext<typeof pathArg & typeof sourceArg & typeof ssgArg>): Promise<void> {
		const targetPath = resolve(ctx.args.path ?? '.');
		const ssg = checkSsg(ctx.args.ssg);
		const filePaths = await getFilePaths(targetPath);
		const result = await generateConfiguration(filePaths, {
			config: ctx.args.source ? { source: ctx.args.source } : undefined,
			buildConfig: ssg ? { ssg } : undefined,
			readFile: readFileFn(targetPath),
		});

		printJson({
			collections: result.collections,
			ssg: result.ssg,
			source: result.config.source ?? null,
		});
	},
});
