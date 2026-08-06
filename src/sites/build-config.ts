export type EnvironmentVariable = {
	key: string;
	value: string;
};

/**
 * Insert or replace an environment variable by key, preserving other entries.
 */
export function upsertEnvironmentVariable(
	existing: EnvironmentVariable[],
	key: string,
	value: string
): EnvironmentVariable[] {
	const result = existing.map((env) => ({ ...env }));
	const index = result.findIndex((env) => env.key === key);
	if (index >= 0) {
		result[index] = { key, value };
	} else {
		result.push({ key, value });
	}
	return result;
}

/**
 * Extract environment variables from a site's build_configuration field,
 * which may be a JSON string or a parsed object.
 */
export function parseEnvironmentVariables(buildConfiguration: unknown): EnvironmentVariable[] {
	if (buildConfiguration == null) {
		return [];
	}

	let config: unknown = buildConfiguration;
	if (typeof config === 'string') {
		try {
			config = JSON.parse(config);
		} catch {
			return [];
		}
	}

	if (typeof config !== 'object' || config === null) {
		return [];
	}

	const compile = (config as { compile?: unknown }).compile;
	if (typeof compile !== 'object' || compile === null) {
		return [];
	}

	const envVars = (compile as { environment_variables?: unknown }).environment_variables;
	if (!Array.isArray(envVars)) {
		return [];
	}

	return envVars.filter(
		(env): env is EnvironmentVariable =>
			typeof env === 'object' &&
			env !== null &&
			typeof (env as EnvironmentVariable).key === 'string' &&
			typeof (env as EnvironmentVariable).value === 'string'
	);
}
