import type {
  PluginServices,
  PluginTuple,
  TypeSafeFlowFunction,
  ValidatePlugins,
} from "./plugin-types";
import { createUploadistaServer } from "./server";
import type { UploadistaServer, UploadistaServerConfig } from "./types";

/**
 * Type-safe configuration for Uploadista server with compile-time plugin validation.
 *
 * This configuration extends the base UploadistaServerConfig with stricter typing
 * that validates plugins match flow requirements at compile time.
 *
 * @template TContext - Framework-specific request context type
 * @template TResponse - Framework-specific response type
 * @template TWebSocket - Framework-specific WebSocket handler type
 * @template TPlugins - Tuple of plugin layers provided to the server
 * @template TFlowRequirements - Union of plugin services required by flows
 */
export type TypeSafeServerConfig<
  TContext,
  TResponse,
  TWebSocket,
  TPlugins extends PluginTuple,
  TFlowRequirements = PluginServices<TPlugins>,
> = Omit<
  UploadistaServerConfig<TContext, TResponse, TWebSocket>,
  "flows" | "plugins"
> & {
  /**
   * Tuple of plugin layers that provide services to flows.
   * The plugins must satisfy all requirements declared by the flows.
   */
  plugins: TPlugins;

  /**
   * Type-safe flow function with explicit requirements.
   * TypeScript validates that all required plugins are provided.
   */
  flows: TypeSafeFlowFunction<TFlowRequirements>;

  /**
   * Compile-time validation that plugins satisfy flow requirements.
   * If this field has type errors, required plugins are missing.
   */
  __validate?: ValidatePlugins<TPlugins, TFlowRequirements>;
};

/**
 * Creates a type-safe Uploadista server with compile-time plugin validation.
 *
 * This function provides the same functionality as `createUploadistaServer`
 * but with stricter typing that ensures all plugin requirements are satisfied.
 *
 * @template TContext - Framework-specific request context type
 * @template TResponse - Framework-specific response type
 * @template TWebSocket - Framework-specific WebSocket handler type
 * @template TPlugins - Tuple of plugin layers
 * @template TFlowRequirements - Union of services required by flows
 *
 * @param config - Type-safe server configuration
 * @returns Promise resolving to UploadistaServer instance
 *
 * @example
 * ```typescript
 * import { createTypeSafeServer } from "@uploadista/server";
 * import { ImagePlugin } from "@uploadista/core/flow";
 * import { sharpImagePlugin } from "@uploadista/flow-images-sharp";
 *
 * // ✅ Type-safe: ImagePlugin is provided
 * const server = await createTypeSafeServer({
 *   plugins: [sharpImagePlugin] as const,
 *   flows: (flowId, clientId) =>
 *     Effect.gen(function* () {
 *       const imageService = yield* ImagePlugin;
 *       return createFlow({ ... });
 *     }),
 *   adapter: honoAdapter({ ... }),
 *   dataStore: { type: "s3", ... },
 *   kvStore: redisKvStore
 * });
 *
 * // ❌ Compile error: ImagePlugin required but not provided
 * const badServer = await createTypeSafeServer({
 *   plugins: [] as const,  // Missing ImagePlugin!
 *   flows: (flowId, clientId) =>
 *     Effect.gen(function* () {
 *       const imageService = yield* ImagePlugin;  // Error: not provided
 *       return createFlow({ ... });
 *     }),
 *   // ...
 * });
 * ```
 */
export async function createTypeSafeServer<
  TContext,
  TResponse,
  TWebSocket = unknown,
  TPlugins extends PluginTuple = PluginTuple,
  TFlowRequirements = PluginServices<TPlugins>,
>(
  config: TypeSafeServerConfig<
    TContext,
    TResponse,
    TWebSocket,
    TPlugins,
    TFlowRequirements
  > &
    // Enforce validation at function call site
    (ValidatePlugins<TPlugins, TFlowRequirements> extends true
      ? object
      : ValidatePlugins<TPlugins, TFlowRequirements>),
): Promise<UploadistaServer<TContext, TResponse, TWebSocket>> {
  return createUploadistaServer(config);
}

/**
 * Helper function to define flow functions with explicit type requirements.
 * Provides better type inference and autocomplete for plugin services.
 *
 * @template TRequirements - Union of plugin services this flow needs
 *
 * @param fn - The flow function implementation
 * @returns The same function with explicit type annotation
 *
 * @example
 * ```typescript
 * import { ImagePlugin } from "@uploadista/core/flow";
 * import { defineFlow } from "@uploadista/server";
 *
 * // Explicitly declare that this flow requires ImagePlugin
 * const imageProcessingFlow = defineFlow<ImagePlugin>((flowId, clientId) =>
 *   Effect.gen(function* () {
 *     const imageService = yield* ImagePlugin;  // Autocomplete works!
 *     const optimized = yield* imageService.optimize(data, { quality: 80 });
 *     return createFlow({ ... });
 *   })
 * );
 * ```
 */
export function defineFlow<TRequirements = never>(
  fn: TypeSafeFlowFunction<TRequirements>,
): TypeSafeFlowFunction<TRequirements> {
  return fn;
}

/**
 * Helper to create a flow that requires no plugins.
 * Useful for simple flows that only use built-in functionality.
 *
 * @example
 * ```typescript
 * import { defineSimpleFlow } from "@uploadista/server";
 *
 * const simpleFlow = defineSimpleFlow((flowId, clientId) =>
 *   Effect.succeed(createFlow({
 *     id: "simple",
 *     nodes: [],
 *     edges: [],
 *     inputSchema: myInputSchema,
 *     outputSchema: myOutputSchema
 *   }))
 * );
 * ```
 */
export function defineSimpleFlow(
  fn: TypeSafeFlowFunction<never>,
): TypeSafeFlowFunction<never> {
  return fn;
}
