import type { UploadistaError, VideoPluginLayer } from "@uploadista/core";
import type {
  CredentialProviderLayer,
  ExtractLayerServices,
  Flow,
  ImageAiPluginLayer,
  ImagePluginLayer,
  ZipPluginLayer,
} from "@uploadista/core/flow";
import type { Effect, Layer } from "effect";
import type { z } from "zod";

/**
 * Utility type to extract all services from a tuple of layers.
 * Given [Layer<A>, Layer<B>], extracts A | B.
 *
 * This is a wrapper around the shared ExtractLayerServices utility from @uploadista/core.
 *
 * @deprecated Use ExtractLayerServices from @uploadista/core/flow/types instead.
 *   This will be removed in a future version.
 */
export type ExtractServicesFromLayers<
  // biome-ignore lint/suspicious/noExplicitAny: Generic constraint must accept any layer configuration
  T extends readonly Layer.Layer<any, any, any>[],
> = ExtractLayerServices<T>;

/**
 * Known plugin layer types for better type inference.
 * This union helps TypeScript understand which plugins are available.
 */
export type KnownPluginLayer =
  | ImagePluginLayer
  | VideoPluginLayer
  | ImageAiPluginLayer
  | CredentialProviderLayer
  | ZipPluginLayer;

/**
 * Type-safe plugin tuple that only accepts known plugin layers.
 * This provides autocomplete and validation for plugin arrays.
 */
export type PluginTuple = readonly KnownPluginLayer[];

/**
 * Extracts the union of all plugin services from a plugin tuple.
 *
 * Uses the shared ExtractLayerServices utility from @uploadista/core for consistency.
 *
 * @example
 * ```typescript
 * type Plugins = [ImagePluginLayer, ZipPluginLayer];
 * type Services = PluginServices<Plugins>;
 * // Services = ImagePlugin | ZipPlugin
 * ```
 */
export type PluginServices<TPlugins extends PluginTuple> =
  ExtractLayerServices<TPlugins>;

/**
 * Type-safe flow function that declares its plugin requirements.
 *
 * @template TRequirements - Union of plugin services this flow needs
 *
 * @example
 * ```typescript
 * // Flow that requires ImagePlugin
 * const myFlow: TypeSafeFlowFunction<ImagePlugin> = (flowId, clientId) =>
 *   Effect.gen(function* () {
 *     const imageService = yield* ImagePlugin;
 *     // ...
 *   });
 * ```
 */
export type TypeSafeFlowFunction<TRequirements = never> = (
  flowId: string,
  clientId: string | null,
) => Effect.Effect<
  Flow<z.ZodSchema<unknown>, z.ZodSchema<unknown>, TRequirements>,
  UploadistaError,
  TRequirements
>;

/**
 * Validates that plugins satisfy flow requirements.
 *
 * This type creates a compile-time error if required plugins are missing.
 * When validation fails, it returns an error object with detailed information
 * including a human-readable message.
 *
 * @template TPlugins - The plugin tuple provided
 * @template TRequirements - The services required by flows
 *
 * @example
 * ```typescript
 * // ✅ Valid: ImagePlugin is provided and required
 * type Valid = ValidatePlugins<[ImagePluginLayer], ImagePlugin>;
 * // Result: true
 *
 * // ❌ Error: ImagePlugin required but not provided
 * type Invalid = ValidatePlugins<[], ImagePlugin>;
 * // Result: {
 * //   __error: "MISSING_REQUIRED_PLUGINS";
 * //   __message: "Missing required plugins: ...";
 * //   __required: ImagePlugin;
 * //   __provided: never;
 * //   __missing: ImagePlugin;
 * // }
 * ```
 */
export type ValidatePlugins<
  TPlugins extends PluginTuple,
  TRequirements,
> = TRequirements extends never
  ? true // No requirements, always valid
  : TRequirements extends PluginServices<TPlugins>
    ? true // All requirements satisfied
    : {
        readonly __error: "MISSING_REQUIRED_PLUGINS";
        readonly __message: "Missing required plugins. Check __missing field for details.";
        readonly __required: TRequirements;
        readonly __provided: PluginServices<TPlugins>;
        readonly __missing: Exclude<TRequirements, PluginServices<TPlugins>>;
        readonly __hint: "Add the missing plugins to your server configuration's plugins array.";
      };

/**
 * Type-safe server configuration with compile-time plugin validation.
 *
 * This ensures that all plugins required by flows are actually provided.
 *
 * @template TPlugins - Tuple of plugin layers
 * @template TFlowRequirements - Union of services that flows need
 *
 * @example
 * ```typescript
 * // ✅ Compiles: ImagePlugin provided and required
 * const config: TypeSafePluginConfig<
 *   [ImagePluginLayer],
 *   ImagePlugin
 * > = {
 *   plugins: [sharpImagePlugin],
 *   flows: (flowId, clientId) => imageFlow
 * };
 *
 * // ❌ Compile error: ImagePlugin required but not provided
 * const bad: TypeSafePluginConfig<
 *   [],
 *   ImagePlugin
 * > = {
 *   plugins: [],
 *   flows: (flowId, clientId) => imageFlow
 * };
 * ```
 */
export type TypeSafePluginConfig<
  TPlugins extends PluginTuple,
  TFlowRequirements,
> = ValidatePlugins<TPlugins, TFlowRequirements> extends true
  ? {
      plugins: TPlugins;
      flows: TypeSafeFlowFunction<TFlowRequirements>;
    }
  : ValidatePlugins<TPlugins, TFlowRequirements>; // Returns error object

/**
 * Extracts plugin requirements from a flow function type.
 *
 * This navigates through the flow function signature to extract the requirements
 * from the Flow type it returns, excluding UploadEngine (provided by runtime).
 *
 * @template TFlowFn - The flow function type to extract requirements from
 *
 * @example
 * ```typescript
 * const myFlow = (flowId: string, clientId: string | null) =>
 *   Effect.succeed(
 *     createFlow({ ... }) // Returns Flow<..., ..., ImagePlugin | ZipPlugin>
 *   );
 *
 * type Requirements = ExtractFlowPluginRequirements<typeof myFlow>;
 * // Requirements = ImagePlugin | ZipPlugin
 * ```
 */
export type ExtractFlowPluginRequirements<
  TFlowFn extends (
    flowId: string,
    clientId: string | null,
  ) => Effect.Effect<unknown, unknown, unknown>,
  // biome-ignore lint/suspicious/noExplicitAny: Conditional type inference requires any for error and requirements parameters
> =
  ReturnType<TFlowFn> extends Effect.Effect<infer TFlow, any, any>
    ? // biome-ignore lint/suspicious/noExplicitAny: Conditional type inference requires any for input and output schema parameters
      TFlow extends Flow<any, any, infer TRequirements>
      ? Exclude<TRequirements, never> // Exclude UploadEngine is handled by FlowPluginRequirements in core
      : never
    : never;

/**
 * Helper type to infer plugin requirements from a flow function.
 *
 * @example
 * ```typescript
 * const myFlow: TypeSafeFlowFunction<ImagePlugin | ZipPlugin> = ...;
 * type Requirements = InferFlowRequirements<typeof myFlow>;
 * // Requirements = ImagePlugin | ZipPlugin
 * ```
 */
export type InferFlowRequirements<T> =
  T extends TypeSafeFlowFunction<infer R> ? R : never;

/**
 * Converts PluginLayer types to Layer.Layer<any, never, any> for runtime use.
 * Maintains type safety at compile time while allowing flexible runtime composition.
 */
export type RuntimePluginLayers<T extends PluginTuple> = {
  [K in keyof T]: T[K] extends Layer.Layer<infer S, infer E, infer R>
    ? Layer.Layer<S, E, R>
    : never;
};
