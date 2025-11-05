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
 * @deprecated Use `createUploadistaServer` with optional type utilities instead.
 *
 * This function is deprecated in favor of the unified `createUploadistaServer` API.
 * The new approach separates validation concerns from server creation, making the
 * API simpler while still providing compile-time validation when desired.
 *
 * ## Migration Guide
 *
 * ### Old Approach (Deprecated)
 * ```typescript
 * import { createTypeSafeServer } from "@uploadista/server";
 *
 * const server = await createTypeSafeServer({
 *   plugins: [sharpImagePlugin] as const,
 *   flows: myFlowFunction,
 *   // ...
 * });
 * ```
 *
 * ### New Approach (Recommended)
 *
 * **Option 1: Runtime validation only (simplest)**
 * ```typescript
 * import { createUploadistaServer } from "@uploadista/server";
 *
 * const server = await createUploadistaServer({
 *   plugins: [sharpImagePlugin, zipPlugin],
 *   flows: myFlowFunction,
 *   // ... Effect validates at runtime
 * });
 * ```
 *
 * **Option 2: With compile-time validation (optional)**
 * ```typescript
 * import {
 *   createUploadistaServer,
 *   ValidatePlugins,
 *   ExtractFlowPluginRequirements
 * } from "@uploadista/server";
 *
 * type Requirements = ExtractFlowPluginRequirements<typeof myFlowFunction>;
 * const plugins = [sharpImagePlugin, zipPlugin] as const;
 * type Validation = ValidatePlugins<typeof plugins, Requirements>;
 * // IDE shows error if plugins don't match requirements
 *
 * const server = await createUploadistaServer({
 *   plugins,
 *   flows: myFlowFunction,
 *   // ...
 * });
 * ```
 *
 * ## Why This Changed
 *
 * 1. **Simpler API**: One function instead of two reduces confusion
 * 2. **Separation of Concerns**: Validation is now optional and separate
 * 3. **Better Flexibility**: Choose validation approach per use case
 * 4. **Clearer Intent**: Explicit validation via type utilities
 * 5. **Same Safety**: Effect-TS still validates at runtime
 *
 * The new approach trusts Effect-TS's design for dynamic dependency injection
 * while providing optional compile-time validation through type utilities.
 *
 * @see createUploadistaServer - The unified server creation API
 * @see ValidatePlugins - Compile-time validation type utility
 * @see ExtractFlowPluginRequirements - Extract requirements from flows
 * @see API_DECISION_GUIDE.md - Complete migration and usage guide
 *
 * @template TContext - Framework-specific request context type
 * @template TResponse - Framework-specific response type
 * @template TWebSocket - Framework-specific WebSocket handler type
 * @template TPlugins - Tuple of plugin layers
 * @template TFlowRequirements - Union of services required by flows
 *
 * @param config - Type-safe server configuration
 * @returns Promise resolving to UploadistaServer instance
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
