import { defineCommand } from 'citty';
import { detectBuildCommands } from './configure/detect-build-commands.ts';
import { detectCollectionsCommand } from './configure/detect-collections.ts';
import { detectSourceCommand } from './configure/detect-source.ts';
import { detectSsgCommand } from './configure/detect-ssg.ts';
import { generateCommand } from './configure/generate.ts';

export const configureCommand = defineCommand({
	meta: {
		name: 'configure',
		description: 'Generate CloudCannon configuration files',
	},
	subCommands: {
		'detect-build-commands': detectBuildCommands,
		'detect-collections': detectCollectionsCommand,
		'detect-source': detectSourceCommand,
		'detect-ssg': detectSsgCommand,
		generate: generateCommand,
	},
});
