import process from 'node:process';
import { type CommandContext, defineCommand } from 'citty';
import { text } from './configure/utility.ts';
import { startDevServer } from './dev/server.ts';

const args = {
	outputPath: {
		type: 'positional',
		description: 'Path to the built site output directory.',
		valueHint: 'path',
		required: true,
	},
	host: {
		type: 'string',
		description: 'The IP address for the dev server to listen on.',
		default: '127.0.0.1',
		valueHint: 'host',
	},
	port: {
		type: 'string',
		description: 'The port for the dev server to listen on.',
		default: '10101',
		valueHint: 'port',
	},
	'live-sync': {
		type: 'boolean',
		description: 'Push disk file changes to the app in real time via SSE.',
		default: true,
		negativeDescription: 'Do not push disk file changes to the app (disables the file watcher).',
	},
	'app-sync': {
		type: 'boolean',
		description: 'Accept app-initiated file writes (uploads, moves, deletes) to disk.',
		default: true,
		negativeDescription: 'Do not accept app-initiated file writes to disk (read-only mode).',
	},
	verbose: {
		type: 'boolean',
		description: 'Log every request (method, path, status, duration).',
		default: false,
	},
} as const;

export const devCommand = defineCommand({
	meta: {
		name: 'dev',
		description: 'Run a local dev server to preview your site in CloudCannon.',
	},
	args,
	async run(ctx: CommandContext<typeof args>): Promise<void> {
		const host = ctx.args.host ?? '127.0.0.1';
		const port = Number.parseInt(ctx.args.port ?? '10101', 10);
		if (Number.isNaN(port) || port < 0 || port > 65535) {
			console.error(text.bad(`Invalid port: ${ctx.args.port}`));
			process.exitCode = 1;
			return;
		}

		const closeServer = await startDevServer(host, port, ctx.args.outputPath, {
			liveSync: ctx.args['live-sync'],
			appSync: ctx.args['app-sync'],
			verbose: ctx.args.verbose,
		});

		const shutdown = async (signal: string): Promise<void> => {
			console.log(`\n${text.secondary(`Received ${signal}, shutting down dev server...`)}`);
			try {
				await closeServer();
			} catch (err: unknown) {
				console.error(text.bad('Error closing dev server:'), err);
			}
			process.exit(0);
		};

		process.on('SIGINT', () => {
			shutdown('SIGINT');
		});
		process.on('SIGTERM', () => {
			shutdown('SIGTERM');
		});
	},
});
