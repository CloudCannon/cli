#!/usr/bin/env node

import { defineCommand, runMain } from 'citty';
import pkg from '../package.json' with { type: 'json' };
import tab from '@bomb.sh/tab/citty';
import { buildsCommand } from './builds.ts';
import { validateCommand } from './configure/validate.ts';
import { configureCommand } from './configure.ts';
import { inboxesCommand } from './inboxes.ts';
import { loginCommand } from './login.ts';
import { logoutCommand } from './logout.ts';
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
		inboxes: inboxesCommand,
		orgs: orgsCommand,
		sites: sitesCommand,
		login: loginCommand,
		logout: logoutCommand,
		validate: validateCommand,
	},
});

await tab(main);
runMain(main);
