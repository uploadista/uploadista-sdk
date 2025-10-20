import type { Flow, UploadServer } from "@uploadista/core";
import type { Effect, Layer } from "effect";
import type z from "zod";

export type LayerSuccessUnion<
  Layers extends readonly Layer.Layer<any, never, never>[],
> = Layers[number] extends Layer.Layer<infer Success, never, never>
  ? Success
  : never;

export type FlowSuccess<
  TFlows extends (
    flowId: string,
    clientId: string | null,
  ) => Effect.Effect<unknown, unknown, unknown>,
> = ReturnType<TFlows> extends Effect.Effect<infer Success, unknown, unknown>
  ? Success
  : never;

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

export type RequiredPluginsOf<
  TFlows extends (
    flowId: string,
    clientId: string | null,
  ) => Effect.Effect<unknown, unknown, unknown>,
> = Exclude<FlowRequirementsOf<TFlows>, UploadServer>;

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
