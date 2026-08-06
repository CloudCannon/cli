import type { BuildConfiguration } from '@cloudcannon/sdk';
import { defineCommand } from 'citty';
import { printJson } from './configure/utility.ts';
import { getSdkClient, handleAPIError } from './sdk-client.ts';
import { parseEnvironmentVariables, upsertEnvironmentVariable } from './sites/build-config.ts';
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
		description: 'List all sites across all organisations.',
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

export const sitesUpdateBuildConfigCommand = defineCommand({
	meta: {
		name: 'update-build-config',
		description: 'Update the build configuration for a site.',
	},
	args: {
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
		'uses-i18n': {
			type: 'boolean',
			description: 'Enable i18n support',
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
		'env-name': {
			type: 'string',
			description: 'Environment variable name to set or update',
			valueHint: 'name',
		},
		'env-value': {
			type: 'string',
			description: 'Environment variable value to set or update',
			valueHint: 'value',
		},
	},
	async run(ctx): Promise<void> {
		const client = await getSdkClient();

		const envName = typeof ctx.args.envName === 'string' ? ctx.args.envName : undefined;
		const envValueProvided = ctx.args.envValue !== undefined;
		const envValue = typeof ctx.args.envValue === 'string' ? ctx.args.envValue : undefined;

		if ((envName !== undefined) !== envValueProvided) {
			console.error('Both --env-name and --env-value must be provided together');
			process.exitCode = 1;
			return;
		}

		const options: BuildConfiguration = {};
		if (ctx.args.ssg !== undefined) {
			options.ssg = ctx.args.ssg;
		}
		if (ctx.args.buildingLocked !== undefined) {
			options.building_locked = !!ctx.args.buildingLocked;
		}
		if (ctx.args.usesI18n !== undefined) {
			options.uses_i18n = !!ctx.args.usesI18n;
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

		const siteUuid = await resolveSiteUuid(client, ctx.args.site);
		if (!siteUuid) {
			process.exitCode = 1;
			return;
		}

		if (envName !== undefined && envValue !== undefined) {
			try {
				const currentSite = await client.site(siteUuid).get();
				const existing = parseEnvironmentVariables(currentSite.build_configuration);
				compile.environment_variables = upsertEnvironmentVariable(
					existing,
					envName,
					envValue
				) as NonNullable<BuildConfiguration['compile']>['environment_variables'];
			} catch (err: unknown) {
				handleAPIError(err);
				process.exitCode = 1;
				return;
			}
		}

		if (Object.keys(compile).length > 0) {
			options.compile = compile as BuildConfiguration['compile'];
		}

		try {
			const site = await client.site(siteUuid).updateBuildConfig(options);
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
