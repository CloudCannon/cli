import type { BuildConfiguration } from '@cloudcannon/sdk';
import { type CommandContext, defineCommand } from 'citty';
import { printJson, text } from './configure/utility.ts';
import { getSdkClient, handleAPIError } from './sdk-client.ts';
import { sitesBuildsCommand } from './sites/builds.ts';
import { sitesCreateCommand } from './sites/create.ts';
import { sitesFilesCommand } from './sites/files.ts';
import {
	sitesPrintLastBuildCommand,
	sitesPrintLastFailedBuildCommand,
	sitesPrintLastFailedSyncCommand,
	sitesPrintLastSyncCommand,
} from './sites/print-last.ts';
import { resolveSiteUuid } from './sites/resolve.ts';

export const sitesListCommand = defineCommand({
	meta: {
		name: 'list',
		description: 'List all sites across all Organizations.',
	},
	async run(): Promise<void> {
		const client = await getSdkClient();

		try {
			const orgs = await client.orgs();
			const allSites = [];
			for (const org of orgs.items) {
				const sites = await client.org(org.uuid).sites();
				allSites.push(...sites.items);
			}
			printJson(allSites);
		} catch (err) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const sitesGetCommand = defineCommand({
	meta: {
		name: 'get',
		description: 'Get a site by name, ID, UUID, or domain.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site name, ID, UUID, or domain',
			valueHint: 'name|id|uuid|domain',
			required: true,
		},
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}

		try {
			const site = await client.site(siteUuid).get();
			printJson(site);
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const sitesRebuildCommand = defineCommand({
	meta: {
		name: 'rebuild',
		description: 'Trigger a rebuild for a site.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site name, ID, UUID, or domain',
			valueHint: 'name|id|uuid|domain',
			required: true,
		},
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();
		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}

		try {
			await client.site(siteUuid).rebuild();
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
			return;
		}

		console.log('Rebuild triggered.');
	},
});

const updateBuildConfigArgs = {
	site: {
		type: 'string',
		description: 'The site name, ID, UUID, or domain',
		valueHint: 'name|id|uuid|domain',
		required: true,
	},
	ssg: {
		type: 'string',
		description: 'Static site generator name',
		valueHint: 'name',
	},
	'building-locked': {
		type: 'boolean',
		description: 'Lock the site from building',
	},
	'default-locale': {
		type: 'string',
		description: 'Default locale for i18n',
		valueHint: 'locale',
	},
	'install-command': {
		type: 'string',
		description: 'Override install command',
		valueHint: 'cmd',
	},
	'build-command': {
		type: 'string',
		description: 'Override build command',
		valueHint: 'cmd',
	},
	'output-path': {
		type: 'string',
		description: 'Override output path',
		valueHint: 'path',
	},
	'preserved-paths': {
		type: 'string',
		description: 'Comma-separated preserved paths',
		valueHint: 'paths',
	},
	'hugo-version': {
		type: 'string',
		description: 'Hugo version',
	},
	'node-version': {
		type: 'string',
		description: 'Node version',
	},
	'ruby-version': {
		type: 'string',
		description: 'Ruby version',
	},
	'deno-version': {
		type: 'string',
		description: 'Deno version',
	},
	'preserve-output': {
		type: 'boolean',
		description: 'Preserve previous output',
	},
	'include-git': {
		type: 'boolean',
		description: 'Include git history in build',
	},
	'environment-variables': {
		type: 'string',
		valueHint: 'key=value',
		description: 'Comma-separated environment variables',
	},
} as const;

export const sitesUpdateBuildConfigCommand = defineCommand({
	meta: {
		name: 'update-build-config',
		description: 'Update the build configuration for a site.',
	},
	args: updateBuildConfigArgs,
	async run(ctx: CommandContext<typeof updateBuildConfigArgs>): Promise<void> {
		const client = await getSdkClient();

		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}

		const siteClient = client.site(siteUuid);

		const options: BuildConfiguration = {};
		if (ctx.args.ssg !== undefined) {
			options.ssg = ctx.args.ssg;
		}
		if (ctx.args.buildingLocked !== undefined) {
			options.building_locked = !!ctx.args.buildingLocked;
		}
		if (typeof ctx.args.defaultLocale === 'string') {
			options.default_locale = ctx.args.defaultLocale;
		}

		const compile: Partial<NonNullable<BuildConfiguration['compile']>> = {};
		if (typeof ctx.args.installCommand === 'string') {
			compile.install_command = ctx.args.installCommand;
		}
		if (typeof ctx.args.buildCommand === 'string') {
			compile.build_command = ctx.args.buildCommand;
		}
		if (typeof ctx.args.outputPath === 'string') {
			compile.output_path = ctx.args.outputPath;
		}
		if (ctx.args.preservedPaths !== undefined && typeof ctx.args.preservedPaths === 'string') {
			compile.preserved_paths = ctx.args.preservedPaths.split(',');
		}
		if (typeof ctx.args.hugoVersion === 'string') {
			compile.hugoVersion = ctx.args.hugoVersion;
		}
		if (typeof ctx.args.nodeVersion === 'string') {
			compile.nodeVersion = ctx.args.nodeVersion;
		}
		if (typeof ctx.args.rubyVersion === 'string') {
			compile.rubyVersion = ctx.args.rubyVersion;
		}
		if (typeof ctx.args.denoVersion === 'string') {
			compile.denoVersion = ctx.args.denoVersion;
		}
		if (ctx.args.preserveOutput !== undefined) {
			compile.preserveOutput = !!ctx.args.preserveOutput;
		}
		if (ctx.args.includeGit !== undefined) {
			compile.includeGit = !!ctx.args.includeGit;
		}
		if (typeof ctx.args['environment-variables'] === 'string') {
			if (ctx.args['environment-variables'].length === 0) {
				compile.environment_variables = [];
			} else {
				const parts = ctx.args['environment-variables'].split(',');
				const envVars: { key: string; value: string }[] = [];
				for (const part of parts) {
					if (part === '...') {
						const site = await siteClient.get();
						const existingEnvVars = site.build_configuration?.compile?.environment_variables ?? [];
						envVars.push(...existingEnvVars);
						continue;
					}

					const match = /^(?<key>[^=]+)=(?<value>.*)$/.exec(part);
					if (!match?.groups) {
						console.error(text.bad(`Error: Unable to parse environment variable ${part}`));
						process.exitCode = 1;
						return;
					}
					envVars.push({ key: match.groups.key, value: match.groups.value });
				}
				compile.environment_variables = envVars;
			}
		}

		if (Object.keys(compile).length > 0) {
			options.compile = compile as BuildConfiguration['compile'];
		}

		try {
			const site = await siteClient.updateBuildConfig(options);
			printJson(site);
		} catch (err: unknown) {
			handleAPIError(err);
			process.exitCode = 1;
		}
	},
});

export const sitesCommand = defineCommand({
	meta: {
		name: 'sites',
		description: 'Manage CloudCannon sites.',
	},
	subCommands: {
		list: sitesListCommand,
		get: sitesGetCommand,
		create: sitesCreateCommand,
		rebuild: sitesRebuildCommand,
		'update-build-config': sitesUpdateBuildConfigCommand,
		files: sitesFilesCommand,
		builds: sitesBuildsCommand,
		'print-last-build': sitesPrintLastBuildCommand,
		'print-last-failed-build': sitesPrintLastFailedBuildCommand,
		'print-last-sync': sitesPrintLastSyncCommand,
		'print-last-failed-sync': sitesPrintLastFailedSyncCommand,
	},
});
