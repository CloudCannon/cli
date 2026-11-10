import { defineCommand } from 'citty';
import migrateRedirectSitesToSubdomainsCommand from './migrations/migrate-redirect-sites-to-subdomains.ts';

export const migrateCommand = defineCommand({
	meta: {
		name: 'migrate',
		description: 'Migrate CloudCannon resources.',
	},
	subCommands: {
		migrateRedirectSitesToSubdomains: migrateRedirectSitesToSubdomainsCommand,
	},
});
