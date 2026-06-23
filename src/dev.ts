import process from 'node:process';
import { defineCommand } from 'citty';
import { startDevServer } from './dev/server.ts';

export const devCommand = defineCommand({
	meta: {
		name: 'dev',
		description: 'Run a local dev server to preview your site in CloudCannon.',
	},
	args: {
		outputPath: {
			type: 'positional',
			description: 'Path to the built site output directory.',
			valueHint: 'path',
			required: true,
		},
		port: {
			type: 'string',
			description: 'Port to run the dev server on.',
			default: '10101',
			valueHint: 'port',
		},
	},
	async run(ctx): Promise<void> {
		const port = Number.parseInt(ctx.args.port ?? '10101', 10);
		if (Number.isNaN(port) || port < 0 || port > 65535) {
			console.error(`Invalid port: ${ctx.args.port}`);
			process.exitCode = 1;
			return;
		}

		const handle = await startDevServer(port, ctx.args.outputPath);

		const shutdown = async (signal: string): Promise<void> => {
			console.log(`\nReceived ${signal}, shutting down dev server...`);
			try {
				await handle.close();
			} catch (err: unknown) {
				console.error('Error closing dev server:', err);
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
