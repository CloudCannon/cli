import { defineCommand } from 'citty';
import { printJson } from './configure/utility.ts';
import { getSdkClient } from './sdk-client.ts';
import { sitesBuildsCommand } from './sites/builds.ts';
import { sitesFilesCommand } from './sites/files.ts';
import {
	sitesPrintLastBuildCommand,
	sitesPrintLastFailedBuildCommand,
	sitesPrintLastFailedSyncCommand,
	sitesPrintLastSyncCommand,
} from './sites/print-last.ts';

export const sitesListCommand = defineCommand({
	meta: {
		name: 'list',
		description: 'List all sites across all organisations.',
	},
	async run(): Promise<void> {
		const client = getSdkClient();
		const orgs = await client.orgs();
		const allSites = [];
		for (const org of orgs.items) {
			const sites = await client.org(org.uuid).sites();
			allSites.push(...sites.items);
		}
		printJson(allSites);
	},
});

export const sitesGetCommand = defineCommand({
	meta: {
		name: 'get',
		description: 'Get a site by UUID.',
	},
	args: {
		site: {
			type: 'string',
			description: 'The site UUID',
			valueHint: 'uuid',
			required: true,
		},
	},
	async run(ctx): Promise<void> {
		const client = getSdkClient();
		const site = await client.site(ctx.args.site).get();
		printJson(site);
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
			description: 'The site UUID',
			valueHint: 'uuid',
			required: true,
		},
	},
	async run(ctx): Promise<void> {
		const client = getSdkClient();
		await client.site(ctx.args.site).rebuild();
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
			description: 'The site UUID',
			valueHint: 'uuid',
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
	},
	async run(ctx): Promise<void> {
		const client = getSdkClient();

		const options: Record<string, unknown> = {};
		if (ctx.args.ssg !== undefined) {
			options.ssg = ctx.args.ssg;
		}
		if (ctx.args.buildingLocked !== undefined) {
			options.building_locked = ctx.args.buildingLocked;
		}
		if (ctx.args.usesI18n !== undefined) {
			options.uses_i18n = ctx.args.usesI18n;
		}
		if (ctx.args.defaultLocale !== undefined) {
			options.default_locale = ctx.args.defaultLocale;
		}

		const compile: Record<string, unknown> = {};
		if (ctx.args.installCommand !== undefined) {
			compile.install_command = ctx.args.installCommand;
		}
		if (ctx.args.buildCommand !== undefined) {
			compile.build_command = ctx.args.buildCommand;
		}
		if (ctx.args.outputPath !== undefined) {
			compile.output_path = ctx.args.outputPath;
		}
		if (ctx.args.preservedPaths !== undefined && typeof ctx.args.preservedPaths === 'string') {
			compile.preserved_paths = ctx.args.preservedPaths.split(',');
		}
		if (ctx.args.hugoVersion !== undefined) {
			compile.hugoVersion = ctx.args.hugoVersion;
		}
		if (ctx.args.nodeVersion !== undefined) {
			compile.nodeVersion = ctx.args.nodeVersion;
		}
		if (ctx.args.rubyVersion !== undefined) {
			compile.rubyVersion = ctx.args.rubyVersion;
		}
		if (ctx.args.denoVersion !== undefined) {
			compile.denoVersion = ctx.args.denoVersion;
		}
		if (ctx.args.preserveOutput !== undefined) {
			compile.preserveOutput = ctx.args.preserveOutput;
		}
		if (ctx.args.includeGit !== undefined) {
			compile.includeGit = ctx.args.includeGit;
		}

		if (Object.keys(compile).length > 0) {
			options.compile = compile;
		}

		const site = await client.site(ctx.args.site).updateBuildConfig(options);
		printJson(site);
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
