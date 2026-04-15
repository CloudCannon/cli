import { resolve } from 'node:path';
import { generateBuildCommands } from '@cloudcannon/gadget';
import { type CommandContext, defineCommand } from 'citty';
import { getFilePaths, printJson, readFileFn } from '../utility.ts';
import { checkSsg, pathArg, sourceArg, ssgArg } from './args.ts';

export const detectBuildCommands = defineCommand({
	meta: {
		name: 'build',
		description: 'Show build command suggestions',
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
		const buildCommands = await generateBuildCommands(filePaths, {
			config: ctx.args.source ? { source: ctx.args.source } : undefined,
			buildConfig: ssg ? { ssg } : undefined,
			readFile: readFileFn(targetPath),
		});

		printJson(buildCommands);
	},
});
