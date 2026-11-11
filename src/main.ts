import { defineCommand } from 'citty';
import pkg from '../package.json' with { type: 'json' };
import { buildsCommand } from './builds.ts';
import { validateCommand } from './configure/validate.ts';
import { configureCommand } from './configure.ts';
import { devCommand } from './dev.ts';
import { inboxesCommand } from './inboxes.ts';
import { loginCommand } from './login.ts';
import { logoutCommand } from './logout.ts';
import { migrateCommand } from './migrate.ts';
import { orgsCommand } from './orgs.ts';
import { sitesCommand } from './sites.ts';

export const main = defineCommand({
	meta: {
		name: 'cloudcannon',
		version: pkg.version,
		description: 'Work with CloudCannon from the command line.',
	},
	subCommands: {
		builds: buildsCommand,
		configure: configureCommand,
		dev: devCommand,
		inboxes: inboxesCommand,
		login: loginCommand,
		logout: logoutCommand,
		migrate: migrateCommand,
		orgs: orgsCommand,
		sites: sitesCommand,
		validate: validateCommand,
	},
});
