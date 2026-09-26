#!/usr/bin/env node

import tab from '@bomb.sh/tab/citty';
import { renderUsage, runMain } from 'citty';
import { main } from './main.ts';

const HELP_FLAGS = new Set(['--help', '-h']);

await tab(main);

// citty prints usage on argument errors as well as for --help. Only the latter is a
// successful result, so the rest goes to stderr and leaves stdout as JSON or empty.
runMain(main, {
	showUsage: async (cmd, parent): Promise<void> => {
		const usage = `${await renderUsage(cmd, parent)}\n`;
		if (process.argv.slice(2).some((arg) => HELP_FLAGS.has(arg))) {
			console.log(usage);
		} else {
			console.error(usage);
		}
	},
});
