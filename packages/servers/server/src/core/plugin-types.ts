import type { UploadistaError } from "@uploadista/core";
import type {
  CredentialProviderLayer,
  Flow,
  ImageAiPluginLayer,
  ImagePluginLayer,
  ZipPluginLayer,
} from "@uploadista/core/flow";
import type { Effect, Layer } from "effect";
import type { z } from "zod";

/**
 * Utility type to extract the service type from a Layer.
 * Given Layer.Layer<ServiceA, never, never>, extracts ServiceA.
 */
// biome-ignore lint/suspicious/noExplicitAny: Utility type needs to work with any layer configuration
export type ExtractLayerService<T> = T extends Layer.Layer<infer S, any, any>
  ? S
  : never;

/**
 * Utility type to extract all services from a tuple of layers.
 * Given [Layer<A>, Layer<B>], extracts A | B.
 */
// biome-ignore lint/suspicious/noExplicitAny: Utility type for extracting services from any layer tuple
export type ExtractServicesFromLayers<
  // biome-ignore lint/suspicious/noExplicitAny: Generic constraint must accept any layer configuration
  T extends readonly Layer.Layer<any, any, any>[],
> = T extends readonly [infer First, ...infer Rest]
  ? // biome-ignore lint/suspicious/noExplicitAny: Pattern matching requires any
    First extends Layer.Layer<any, any, any>
    ? // biome-ignore lint/suspicious/noExplicitAny: Recursive constraint needs any
      Rest extends readonly Layer.Layer<any, any, any>[]
      ? ExtractLayerService<First> | ExtractServicesFromLayers<Rest>
      : ExtractLayerService<First>
    : never
  : never;

/**
 * Known plugin layer types for better type inference.
 * This union helps TypeScript understand which plugins are available.
 */
export type KnownPluginLayer =
  | ImagePluginLayer
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
 * @example
 * ```typescript
 * type Plugins = [ImagePluginLayer, ZipPluginLayer];
 * type Services = PluginServices<Plugins>;
 * // Services = ImagePlugin | ZipPlugin
 * ```
 */
export type PluginServices<TPlugins extends PluginTuple> =
  ExtractServicesFromLayers<TPlugins>;

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
 *
 * @template TPlugins - The plugin tuple provided
 * @template TRequirements - The services required by flows
 *
 * @example
 * ```typescript
 * // ✅ Valid: ImagePlugin is provided and required
 * type Valid = ValidatePlugins<[ImagePluginLayer], ImagePlugin>;
 *
 * // ❌ Error: ImagePlugin required but not provided
 * type Invalid = ValidatePlugins<[], ImagePlugin>;
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
        __error: "Missing required plugins";
        __required: TRequirements;
        __provided: PluginServices<TPlugins>;
        __missing: Exclude<TRequirements, PluginServices<TPlugins>>;
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
 * Helper type to infer plugin requirements from a flow function.
 *
 * @example
 * ```typescript
 * const myFlow: TypeSafeFlowFunction<ImagePlugin | ZipPlugin> = ...;
 * type Requirements = InferFlowRequirements<typeof myFlow>;
 * // Requirements = ImagePlugin | ZipPlugin
 * ```
 */
export type InferFlowRequirements<T> = T extends TypeSafeFlowFunction<infer R>
  ? R
  : never;

/**
 * Converts PluginLayer types to Layer.Layer<any, never, any> for runtime use.
 * Maintains type safety at compile time while allowing flexible runtime composition.
 */
export type RuntimePluginLayers<T extends PluginTuple> = {
  [K in keyof T]: T[K] extends Layer.Layer<infer S, infer E, infer R>
    ? Layer.Layer<S, E, R>
    : never;
};
