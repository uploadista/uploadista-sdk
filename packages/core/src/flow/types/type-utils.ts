/**
 * Shared type utilities for extracting and manipulating Effect and Layer types.
 *
 * This module provides foundational type utilities used across the Uploadista SDK
 * for working with Effect-TS constructs like Layers and Effects.
 *
 * @module type-utils
 */

import type { Effect, Layer } from "effect";

/**
 * Extracts the service type from an Effect Layer.
 *
 * Given a Layer that provides a service, this type utility extracts
 * the service type from the Layer's type signature.
 *
 * @template T - The Layer type to extract from
 * @returns The service type provided by the layer, or never if T is not a Layer
 *
 * @example
 * ```typescript
 * type MyLayer = Layer.Layer<ServiceA, never, never>;
 * type Service = ExtractLayerService<MyLayer>;
 * // Service = ServiceA
 * ```
 *
 * @example
 * ```typescript
 * import { ImagePluginLayer } from '@uploadista/core';
 *
 * type ImageService = ExtractLayerService<ImagePluginLayer>;
 * // ImageService = ImagePlugin
 * ```
 */

export type ExtractLayerService<
  T,
  TError = never,
  TRequirements = never,
> = T extends Layer.Layer<infer S, TError, TRequirements> ? S : never;

/**
 * Extracts all service types from a tuple of layers and returns them as a union.
 *
 * This type recursively processes a tuple of Layer types and extracts all
 * the services they provide, combining them into a single union type.
 *
 * @template T - A readonly tuple of Layer types
 * @returns A union of all service types provided by the layers, or never for empty tuples
 *
 * @example
 * ```typescript
 * type Layers = [
 *   Layer.Layer<ServiceA, never, never>,
 *   Layer.Layer<ServiceB, never, never>,
 *   Layer.Layer<ServiceC, never, never>
 * ];
 * type Services = ExtractLayerServices<Layers>;
 * // Services = ServiceA | ServiceB | ServiceC
 * ```
 *
 * @example
 * ```typescript
 * import { ImagePluginLayer, ZipPluginLayer } from '@uploadista/core';
 *
 * type PluginLayers = [ImagePluginLayer, ZipPluginLayer];
 * type AllServices = ExtractLayerServices<PluginLayers>;
 * // AllServices = ImagePlugin | ZipPlugin
 * ```
 *
 * @example
 * ```typescript
 * type EmptyLayers = [];
 * type NoServices = ExtractLayerServices<EmptyLayers>;
 * // NoServices = never
 * ```
 */
export type ExtractLayerServices<
  // biome-ignore lint/suspicious/noExplicitAny: Generic constraint must work with any layer configuration
  T extends readonly Layer.Layer<any, any, any>[],
> = T extends readonly []
  ? never
  : {
      // biome-ignore lint/suspicious/noExplicitAny: Type extraction requires any for inference
      [K in keyof T]: T[K] extends Layer.Layer<infer S, any, any> ? S : never;
    }[number];

/**
 * Unwraps an Effect type to extract its success value type.
 *
 * If the input type is an Effect, this extracts the success type (first type parameter).
 * If the input is not an Effect, it returns the type unchanged.
 *
 * @template T - The type to resolve, potentially an Effect
 * @returns The success type if T is an Effect, otherwise T
 *
 * @example
 * ```typescript
 * type MyEffect = Effect.Effect<string, Error, never>;
 * type Result = ResolveEffect<MyEffect>;
 * // Result = string
 * ```
 *
 * @example
 * ```typescript
 * type NonEffect = { data: string };
 * type Result = ResolveEffect<NonEffect>;
 * // Result = { data: string }
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: Utility type needs to handle any Effect type parameters
export type ResolveEffect<T> =
  T extends Effect.Effect<infer S, any, any> ? S : T;

/**
 * Extracts the error type from an Effect.
 *
 * Given an Effect type, this utility extracts the error type
 * (second type parameter) from the Effect's type signature.
 *
 * @template T - The Effect type to extract from
 * @returns The error type of the Effect, or never if T is not an Effect
 *
 * @example
 * ```typescript
 * type MyEffect = Effect.Effect<string, ValidationError, never>;
 * type ErrorType = ExtractEffectError<MyEffect>;
 * // ErrorType = ValidationError
 * ```
 *
 * @example
 * ```typescript
 * type SafeEffect = Effect.Effect<number, never, SomeService>;
 * type ErrorType = ExtractEffectError<SafeEffect>;
 * // ErrorType = never (no errors possible)
 * ```
 */
// biome-ignore lint/suspicious/noExplicitAny: Utility type needs to handle any Effect type parameters
export type ExtractEffectError<T> =
  T extends Effect.Effect<any, infer E, any> ? E : never;

/**
 * Extracts the requirements (context) type from an Effect.
 *
 * Given an Effect type, this utility extracts the requirements type
 * (third type parameter) from the Effect's type signature. This represents
 * the services that must be provided for the Effect to run.
 *
 * @template T - The Effect type to extract from
 * @returns The requirements type of the Effect, or never if T is not an Effect
 *
 * @example
 * ```typescript
 * type MyEffect = Effect.Effect<string, Error, Database | Logger>;
 * type Requirements = ExtractEffectRequirements<MyEffect>;
 * // Requirements = Database | Logger
 * ```
 *
 * @example
 * ```typescript
 * import { ImagePlugin, ZipPlugin } from '@uploadista/core';
 *
 * type ProcessEffect = Effect.Effect<
 *   ProcessedImage,
 *   ProcessError,
 *   ImagePlugin | ZipPlugin
 * >;
 * type Needed = ExtractEffectRequirements<ProcessEffect>;
 * // Needed = ImagePlugin | ZipPlugin
 * ```
 */
export type ExtractEffectRequirements<T> =
  // biome-ignore lint/suspicious/noExplicitAny: Type parameter extraction requires any
  T extends Effect.Effect<any, any, infer R> ? R : never;
