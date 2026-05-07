#!/usr/bin/env node

import { defineCommand, runMain } from 'citty';
import pkg from '../package.json' with { type: 'json' };
import { buildsCommand } from './builds.ts';
import { configureCommand } from './configure.ts';
import { orgsCommand } from './orgs.ts';
import { sitesCommand } from './sites.ts';

const main = defineCommand({
	meta: {
		name: 'cloudcannon',
		version: pkg.version,
		description: 'Work with CloudCannon from the command line.',
	},
	subCommands: {
		builds: buildsCommand,
		configure: configureCommand,
		orgs: orgsCommand,
		sites: sitesCommand,
	},
});

runMain(main);
