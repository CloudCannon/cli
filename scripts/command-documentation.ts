import type { ArgDef, ArgsDef, CommandDef, CommandMeta } from 'citty';
import { renderUsage } from 'citty';

export interface ArgDocumentation {
	name: string;
	type: 'boolean' | 'string' | 'enum' | 'positional';
	description?: string;
	valueHint?: string;
	alias?: string[];
	default?: boolean | number | string;
	options?: string[];
	required: boolean;
}

export interface CommandDocumentation {
	name: string;
	fullName: string;
	description?: string;
	version?: string;
	alias?: string[];
	usage: string;
	args?: ArgDocumentation[];
	options?: ArgDocumentation[];
	subCommands?: CommandDocumentation[];
}

async function resolveValue<T>(input: T | (() => T | Promise<T>) | Promise<T>): Promise<T> {
	return typeof input === 'function' ? (input as () => T | Promise<T>)() : input;
}

function toArray<T>(value: T | T[]): T[] {
	return Array.isArray(value) ? value : [value];
}

const NEGATIVE_PREFIX = /^no[-A-Z]/;

function documentArg(name: string, def: ArgDef): ArgDocumentation[] {
	const type = def.type ?? 'string';
	const alias = 'alias' in def && def.alias ? toArray(def.alias) : [];
	const required =
		type === 'positional'
			? def.required !== false && def.default === undefined
			: def.required === true && def.default === undefined;

	const docs: ArgDocumentation[] = [
		{
			name,
			type,
			description: descriptionToMarkdown(def.description),
			valueHint: def.valueHint,
			alias: alias.length > 0 ? alias : undefined,
			default: def.default,
			options: 'options' in def ? def.options : undefined,
			required,
		},
	];

	const negativeDescription = 'negativeDescription' in def ? def.negativeDescription : undefined;
	if (
		type === 'boolean' &&
		(def.default === true || negativeDescription) &&
		!NEGATIVE_PREFIX.test(name)
	) {
		docs.push({
			name: `no-${name}`,
			type,
			description: descriptionToMarkdown(negativeDescription),
			alias: alias.length > 0 ? alias.map((a) => `no-${a}`) : undefined,
			required,
		});
	}

	return docs;
}

function stripAnsi(text: string): string {
	return text.replace(/\u001B\[\d+m/g, '');
}

const EMPHASIS_STYLE = /\u001B\[34m\u001B\[3m(.*?)\u001B\[23m\u001B\[39m/g;

/**
 * Converts emphasised (`text.em`) terminal styling into markdown code spans,
 * stripping any other ANSI escape codes. Styling is only present when the
 * documentation is generated with color output forced on.
 */
function descriptionToMarkdown(input?: string): string | undefined {
	return input === undefined ? undefined : stripAnsi(input.replace(EMPHASIS_STYLE, '`$1`'));
}

/**
 * Recursively converts a citty command definition into a plain documentation
 * tree. Hidden commands are excluded.
 */
export async function documentCommand<T extends ArgsDef>(
	command: CommandDef<T>,
	name?: string,
	parentFullName?: string
): Promise<CommandDocumentation> {
	const meta: CommandMeta = (await resolveValue(command.meta)) ?? {};
	const commandName = name ?? meta.name ?? '';
	const fullName = parentFullName ? `${parentFullName} ${commandName}` : commandName;
	const alias = meta.alias ? toArray(meta.alias) : [];

	const parent: CommandDef<T> | undefined = parentFullName
		? { meta: { name: parentFullName } }
		: undefined;
	const rendered = stripAnsi(await renderUsage(command, parent));
	const usage = rendered.match(/^USAGE (.*)$/m)?.[1]?.trim() ?? fullName;

	const argDefs: ArgsDef = (await resolveValue(command.args)) ?? {};
	const args = Object.entries(argDefs).flatMap(([argName, def]) => documentArg(argName, def));
	const positional = args.filter((arg) => arg.type === 'positional');
	const options = args.filter((arg) => arg.type !== 'positional');

	const subCommandDefs = (await resolveValue(command.subCommands)) ?? {};
	const subCommands: CommandDocumentation[] = [];
	for (const [subName, resolvableSubCommand] of Object.entries(subCommandDefs)) {
		const subCommand = await resolveValue(resolvableSubCommand);
		const subMeta = await resolveValue(subCommand.meta);
		if (subMeta?.hidden) {
			continue;
		}
		subCommands.push(await documentCommand(subCommand, subName, fullName));
	}

	return {
		name: commandName,
		fullName,
		description: descriptionToMarkdown(meta.description),
		version: meta.version,
		alias: alias.length > 0 ? alias : undefined,
		usage,
		args: positional.length > 0 ? positional : undefined,
		options: options.length > 0 ? options : undefined,
		subCommands: subCommands.length > 0 ? subCommands : undefined,
	};
}
