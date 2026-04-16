import { resolve } from 'node:path';
import { ssgs } from '@cloudcannon/gadget';
import { type CommandContext, defineCommand } from 'citty';
import { checkSsg, detectSsg, getFilePaths, pathArg, printJson, ssgArg } from './utility.ts';

export const detectSourceCommand = defineCommand({
	meta: {
		name: 'detect-source',
		description: 'Detect the source folder.',
	},
	args: {
		...pathArg,
		...ssgArg,
	},
	async run(ctx: CommandContext<typeof pathArg & typeof ssgArg>): Promise<void> {
		const targetPath = resolve(ctx.args.path ?? '.');
		const filePaths = await getFilePaths(targetPath);
		const ssg = checkSsg(ctx.args.ssg) ?? detectSsg(filePaths).ssg;

		printJson({
			source: ssgs[ssg].getSource(filePaths) ?? null,
			ssg,
		});
	},
});
