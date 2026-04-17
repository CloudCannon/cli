import { resolve } from 'node:path';
import { type CommandContext, defineCommand } from 'citty';
import { detectSsg, getFilePaths, pathArg, printJson } from './utility.ts';

export const detectSsgCommand = defineCommand({
	meta: {
		name: 'detect-ssg',
		description: 'Detect the static site generator.',
	},
	args: {
		...pathArg,
	},
	async run(ctx: CommandContext<typeof pathArg>): Promise<void> {
		const targetPath = resolve(ctx.args.path ?? '.');
		const filePaths = await getFilePaths(targetPath);

		printJson(detectSsg(filePaths));
	},
});
