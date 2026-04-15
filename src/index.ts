import { defineCommand, runMain } from 'citty';
import pkg from '../package.json' with { type: 'json' };
import { configureCommand } from './configure.ts';

const main = defineCommand({
	meta: {
		name: 'cloudcannon',
		version: pkg.version,
		description: 'Work with CloudCannon from the command line.',
	},
	subCommands: {
		configure: configureCommand,
	},
});

runMain(main);
