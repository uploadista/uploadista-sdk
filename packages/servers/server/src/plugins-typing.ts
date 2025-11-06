/**
 * @deprecated This module is deprecated and will be removed in a future version.
 *
 * Please migrate to the new consolidated plugin types from `@uploadista/server/core/plugin-types`:
 *
 * Migration guide:
 * - `LayerSuccessUnion<T>` → `ExtractLayerServices<T>` from `@uploadista/core/flow/types`
 * - `FlowRequirementsOf<T>` → `ExtractFlowPluginRequirements<T>` from `@uploadista/server/core/plugin-types`
 * - `RequiredPluginsOf<T>` → `ExtractFlowPluginRequirements<T>` from `@uploadista/server/core/plugin-types`
 * - `PluginAssertion<TFlows, TPlugins>` → `ValidatePlugins<TPlugins, TRequirements>` from `@uploadista/server/core/plugin-types`
 *
 * See the migration guide in the documentation for more details.
 *
 * @module plugins-typing
 */

import type { Flow, UploadServer } from "@uploadista/core";
import type { ExtractLayerServices } from "@uploadista/core/flow/types";
import type { Effect, Layer } from "effect";
import type z from "zod";

/**
 * @deprecated Use `ExtractLayerServices` from `@uploadista/core/flow/types` instead.
 *
 * Extracts service types from a tuple of layers.
 *
 * @example Migration
 * ```typescript
 * // Old
 * import { LayerSuccessUnion } from '@uploadista/server/plugins-typing';
 * type Services = LayerSuccessUnion<[ImagePluginLayer, ZipPluginLayer]>;
 *
 * // New
 * import { ExtractLayerServices } from '@uploadista/core/flow/types';
 * type Services = ExtractLayerServices<[ImagePluginLayer, ZipPluginLayer]>;
 * ```
 */
export type LayerSuccessUnion<
  Layers extends readonly Layer.Layer<any, never, never>[],
> = ExtractLayerServices<Layers>;

/**
 * @deprecated This type is deprecated. Extract flow requirements directly from your flow types instead.
 *
 * Extracts the success type from a flow function's Effect return value.
 */
export type FlowSuccess<
  TFlows extends (
    flowId: string,
    clientId: string | null,
  ) => Effect.Effect<unknown, unknown, unknown>,
> = ReturnType<TFlows> extends Effect.Effect<infer Success, unknown, unknown>
  ? Success
  : never;

/**
 * @deprecated Use `ExtractFlowPluginRequirements` from `@uploadista/server/core/plugin-types` instead.
 *
 * Extracts plugin requirements from a flow function, excluding UploadServer.
 *
 * @example Migration
 * ```typescript
 * // Old
 * import { FlowRequirementsOf } from '@uploadista/server/plugins-typing';
 * type Requirements = FlowRequirementsOf<typeof myFlowFunction>;
 *
 * // New
 * import { ExtractFlowPluginRequirements } from '@uploadista/server/core/plugin-types';
 * type Requirements = ExtractFlowPluginRequirements<typeof myFlowFunction>;
 * ```
 */
export type FlowRequirementsOf<
  TFlows extends (
    flowId: string,
    clientId: string | null,
  ) => Effect.Effect<unknown, unknown, unknown>,
> = FlowSuccess<TFlows> extends Flow<
  z.ZodSchema<unknown>,
  z.ZodSchema<unknown>,
  infer R
>
  ? Exclude<R, UploadServer>
  : never;

/**
 * @deprecated Use `ExtractFlowPluginRequirements` from `@uploadista/server/core/plugin-types` instead.
 *
 * This is an alias for FlowRequirementsOf and provides the same functionality.
 *
 * @example Migration
 * ```typescript
 * // Old
 * import { RequiredPluginsOf } from '@uploadista/server/plugins-typing';
 * type Requirements = RequiredPluginsOf<typeof myFlowFunction>;
 *
 * // New
 * import { ExtractFlowPluginRequirements } from '@uploadista/server/core/plugin-types';
 * type Requirements = ExtractFlowPluginRequirements<typeof myFlowFunction>;
 * ```
 */
export type RequiredPluginsOf<
  TFlows extends (
    flowId: string,
    clientId: string | null,
  ) => Effect.Effect<unknown, unknown, unknown>,
> = Exclude<FlowRequirementsOf<TFlows>, UploadServer>;

/**
 * @deprecated Use `ValidatePlugins` from `@uploadista/server/core/plugin-types` instead.
 *
 * This type validates plugin requirements at compile time.
 *
 * @example Migration
 * ```typescript
 * // Old
 * import { PluginAssertion } from '@uploadista/server/plugins-typing';
 * type Validation = PluginAssertion<typeof myFlowFunction, typeof plugins>;
 *
 * // New
 * import { ValidatePlugins, ExtractFlowPluginRequirements } from '@uploadista/server/core/plugin-types';
 * type Requirements = ExtractFlowPluginRequirements<typeof myFlowFunction>;
 * type Validation = ValidatePlugins<typeof plugins, Requirements>;
 * ```
 */
export type PluginAssertion<
  TFlows extends (
    flowId: string,
    clientId: string | null,
  ) => Effect.Effect<unknown, unknown, unknown>,
  // biome-ignore lint/suspicious/noExplicitAny: Permissive constraint allows plugin tuples where each plugin provides subset of requirements
  TPlugins extends readonly Layer.Layer<any, never, never>[],
> = Exclude<
  RequiredPluginsOf<TFlows>,
  LayerSuccessUnion<TPlugins>
> extends never
  ? unknown
  : {
      __missingPlugins: Exclude<
        RequiredPluginsOf<TFlows>,
        LayerSuccessUnion<TPlugins>
      >;
    };
