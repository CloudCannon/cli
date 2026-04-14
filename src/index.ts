import { parseArgs } from 'node:util';
import pkg from '../package.json' with { type: 'json' };
import { run } from './configure/configure.ts';
import { printHelp, warning } from './utility.ts';

async function main(): Promise<void> {
	const args = process.argv.slice(2);

	const { tokens, values } = parseArgs({
		args,
		options: {
			help: { type: 'boolean', short: 'h', default: false },
			version: { type: 'boolean', short: 'V', default: false },
		},
		tokens: true,
		allowPositionals: true,
		strict: false,
	});

	const commandToken = tokens.find((token) => token.kind === 'positional');

	if (commandToken) {
		const command = commandToken.value;
		const remainingArgs = args.slice(commandToken.index + 1);

		if (command === 'configure') {
			run(remainingArgs);
		} else {
			console.error(`${warning('Unknown command:')} ${command}`);
			printHelp();
			process.exit(1);
		}

		return;
	}

	if (values.help) {
		return printHelp({
			commands: [{ value: 'configure', description: 'Generate CloudCannon configuration files' }],
			flags: [
				{ value: '-h, --help', description: 'Show help for command' },
				{ value: '-V, --version', description: 'Show version' },
			],
		});
	}

	if (values.version) {
		return console.log(`cloudcannon ${pkg.version}`);
	}
}

main().catch((error: unknown) => {
	console.error(warning('Unknown error'));
	console.error(error);
	process.exit(1);
});
