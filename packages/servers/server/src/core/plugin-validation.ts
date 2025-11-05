/**
 * Runtime plugin validation utilities.
 *
 * This module provides runtime validation to ensure that all plugins required
 * by flows are actually provided to the server. While Effect-TS will catch
 * missing dependencies at runtime, this validation provides better error messages
 * and fails fast during server initialization.
 *
 * @module plugin-validation
 */

import type { PluginLayer } from "@uploadista/core";
import { Effect } from "effect";

/**
 * Result of plugin validation.
 */
export type PluginValidationResult =
	| {
			success: true;
	  }
	| {
			success: false;
			required: string[];
			provided: string[];
			missing: string[];
			suggestions: Array<{
				name: string;
				packageName: string;
				importStatement: string;
			}>;
	  };

/**
 * Known plugin mapping for generating helpful error messages.
 *
 * This maps service identifiers to their package names and variable names
 * for generating import suggestions.
 */
const KNOWN_PLUGINS: Record<
	string,
	{ packageName: string; variableName: string }
> = {
	ImagePlugin: {
		packageName: "@uploadista/flow-images-sharp",
		variableName: "sharpImagePlugin",
	},
	ImageAiPlugin: {
		packageName: "@uploadista/flow-images-replicate",
		variableName: "replicateImagePlugin",
	},
	ZipPlugin: {
		packageName: "@uploadista/flow-utility-zipjs",
		variableName: "zipPlugin",
	},
	CredentialProvider: {
		packageName: "@uploadista/core",
		variableName: "credentialProviderLayer",
	},
};

/**
 * Extracts service identifier from a plugin layer.
 *
 * This attempts to identify the service provided by a layer using various
 * heuristics. The exact implementation depends on how Effect-TS exposes
 * layer metadata.
 *
 * @param layer - The plugin layer to inspect
 * @returns Service identifier string or null if not identifiable
 */
function extractServiceIdentifier(layer: PluginLayer): string | null {
	// Attempt to extract service identifier from layer
	// Note: Effect-TS doesn't expose this information in a standard way,
	// so we use Symbol.toStringTag or constructor name as fallbacks

	try {
		// Try to get the service tag if available
		// biome-ignore lint/suspicious/noExplicitAny: Layer introspection requires accessing internal properties
		const layerAny = layer as any;

		// Check for common patterns in Effect layers
		if (layerAny._tag) {
			return layerAny._tag;
		}

		if (layerAny.constructor?.name) {
			return layerAny.constructor.name;
		}

		// Try to extract from the layer's context if available
		if (layerAny.context?.services) {
			const services = Array.from(layerAny.context.services.keys());
			if (services.length > 0) {
				// biome-ignore lint/suspicious/noExplicitAny: Service introspection requires accessing internal properties
				const firstService = services[0] as any;
				if (firstService.key) {
					return firstService.key;
				}
			}
		}

		return null;
	} catch {
		// If we can't extract the identifier, return null
		return null;
	}
}

/**
 * Extracts service identifiers from an array of plugin layers.
 *
 * @param plugins - Array of plugin layers
 * @returns Array of service identifier strings
 */
export function extractServiceIdentifiers(
	plugins: readonly PluginLayer[],
): string[] {
	return plugins
		.map((plugin) => extractServiceIdentifier(plugin))
		.filter((id): id is string => id !== null);
}

/**
 * Validates that all required plugins are provided.
 *
 * This is a runtime validation function that checks if the plugins array
 * contains all services required by the flows. It's called during server
 * initialization to provide early, clear error messages.
 *
 * Note: This validation is best-effort because we can't reliably extract
 * requirements from flow functions at runtime without executing them.
 * The main validation happens via Effect-TS's dependency injection.
 *
 * @param config - Validation configuration
 * @returns Validation result with detailed error information if validation fails
 *
 * @example
 * ```typescript
 * const result = validatePluginRequirements({
 *   plugins: [sharpImagePlugin, zipPlugin],
 *   expectedServices: ['ImagePlugin', 'ZipPlugin']
 * });
 *
 * if (!result.success) {
 *   console.error('Missing plugins:', result.missing);
 *   console.error('Suggestions:', result.suggestions);
 * }
 * ```
 */
export function validatePluginRequirements(config: {
	plugins: readonly PluginLayer[];
	expectedServices?: string[];
}): PluginValidationResult {
	const { plugins, expectedServices = [] } = config;

	// Extract identifiers from provided plugins
	const providedServices = extractServiceIdentifiers(plugins);

	// Check for missing services
	const missing = expectedServices.filter(
		(required) => !providedServices.includes(required),
	);

	if (missing.length === 0) {
		return { success: true };
	}

	// Generate suggestions for missing plugins
	const suggestions = missing
		.map((service) => {
			const knownPlugin = KNOWN_PLUGINS[service];
			if (!knownPlugin) {
				return null;
			}

			return {
				name: service,
				packageName: knownPlugin.packageName,
				importStatement: `import { ${knownPlugin.variableName} } from '${knownPlugin.packageName}';`,
			};
		})
		.filter((s): s is NonNullable<typeof s> => s !== null);

	return {
		success: false,
		required: expectedServices,
		provided: providedServices,
		missing,
		suggestions,
	};
}

/**
 * Creates a formatted error message for plugin validation failures.
 *
 * This generates a detailed, human-readable error message that includes:
 * - List of required plugins
 * - List of provided plugins
 * - List of missing plugins
 * - Import statements for missing plugins (if known)
 * - Example server configuration
 *
 * @param result - Failed validation result
 * @returns Formatted error message string
 *
 * @example
 * ```typescript
 * const result = validatePluginRequirements({ ... });
 * if (!result.success) {
 *   const message = formatPluginValidationError(result);
 *   throw new Error(message);
 * }
 * ```
 */
export function formatPluginValidationError(
	result: Extract<PluginValidationResult, { success: false }>,
): string {
	const lines: string[] = [
		"Server initialization failed: Missing required plugins",
		"",
		`Required: ${result.required.join(", ")}`,
		`Provided: ${result.provided.length > 0 ? result.provided.join(", ") : "(none)"}`,
		`Missing:  ${result.missing.join(", ")}`,
		"",
	];

	if (result.suggestions.length > 0) {
		lines.push("Add the missing plugins to your configuration:");
		lines.push("");
		for (const suggestion of result.suggestions) {
			lines.push(`  ${suggestion.importStatement}`);
		}
		lines.push("");
		lines.push("  const server = await createUploadistaServer({");
		lines.push(
			`    plugins: [${[...result.provided, ...result.missing.map((m) => KNOWN_PLUGINS[m]?.variableName || m)].join(", ")}],`,
		);
		lines.push("    // ...");
		lines.push("  });");
	} else {
		lines.push(
			"Note: Could not determine package names for missing plugins.",
		);
		lines.push("Please ensure all required plugin layers are provided.");
	}

	return lines.join("\n");
}

/**
 * Effect-based plugin validation that can be composed with other Effects.
 *
 * This provides an Effect-TS native way to validate plugins, allowing it
 * to be composed with other Effects in the server initialization pipeline.
 *
 * @param config - Validation configuration
 * @returns Effect that succeeds if validation passes, fails with UploadistaError if not
 *
 * @example
 * ```typescript
 * const validatedServer = Effect.gen(function* () {
 *   yield* validatePluginRequirementsEffect({
 *     plugins: [sharpImagePlugin],
 *     expectedServices: ['ImagePlugin', 'ZipPlugin']
 *   });
 *
 *   return yield* createServerEffect(...);
 * });
 * ```
 */
export function validatePluginRequirementsEffect(config: {
	plugins: readonly PluginLayer[];
	expectedServices?: string[];
}): Effect.Effect<void, Error> {
	return Effect.sync(() => {
		const result = validatePluginRequirements(config);

		if (!result.success) {
			const message = formatPluginValidationError(result);
			throw new Error(message);
		}
	});
}

/**
 * Validates plugin configuration at runtime during server initialization.
 *
 * This is a convenience function that performs validation and throws a
 * descriptive error if validation fails. Use this at the beginning of
 * createUploadistaServer to fail fast with clear error messages.
 *
 * @param config - Validation configuration
 * @throws Error with detailed message if validation fails
 *
 * @example
 * ```typescript
 * export const createUploadistaServer = async (config) => {
 *   // Validate plugins early
 *   validatePluginsOrThrow({
 *     plugins: config.plugins,
 *     expectedServices: ['ImagePlugin', 'ZipPlugin']
 *   });
 *
 *   // Continue with server creation...
 * };
 * ```
 */
export function validatePluginsOrThrow(config: {
	plugins: readonly PluginLayer[];
	expectedServices?: string[];
}): void {
	const result = validatePluginRequirements(config);

	if (!result.success) {
		const message = formatPluginValidationError(result);
		throw new Error(message);
	}
}
