/**
 * Type tests for type-utils.ts
 *
 * These tests verify that type utilities work correctly with various inputs
 * and produce the expected output types. Tests use expectType assertions
 * to validate compile-time type behavior.
 */

import { Effect, Layer } from "effect";
import { expectType } from "tsd";

import {
  type UploadistaError,
  VideoPlugin,
  type ZipInput,
  type ZipParams,
  ZipPlugin,
} from "../src";
import { ImagePlugin } from "../src/flow/plugins/image-plugin";
import type {
  DescribeVideoMetadata,
  ExtractFrameVideoParams,
  ResizeParams,
  ResizeVideoParams,
  TranscodeVideoParams,
  TrimVideoParams,
} from "../src/flow/plugins/types";
import type { OptimizeParams } from "../src/flow/plugins/types/optimize-node";
import type { Transformation } from "../src/flow/plugins/types/transform-image-node";
import type {
  ExtractEffectError,
  ExtractEffectRequirements,
  ExtractLayerService,
  ExtractLayerServices,
  ResolveEffect,
} from "../src/flow/types/type-utils";

// ============================================================================
// Test Services and Layers
// ============================================================================

// Create test layers
const ImageLayer = Layer.succeed(
  ImagePlugin,
  ImagePlugin.of({
    optimize: (input: Uint8Array, _options: OptimizeParams) =>
      Effect.succeed(input),
    resize: (input: Uint8Array, _options: ResizeParams) =>
      Effect.succeed(input),
    transform: (input: Uint8Array, _options: Transformation) =>
      Effect.succeed(input),
  }),
);
const ZipLayer = Layer.succeed(
  ZipPlugin,
  ZipPlugin.of({
    zip: (_inputs: ZipInput[], _options: ZipParams) =>
      Effect.succeed(new Uint8Array([])),
  }),
);
const VideoLayer = Layer.succeed(
  VideoPlugin,
  VideoPlugin.of({
    transcode: (input: Uint8Array, _options: TranscodeVideoParams) =>
      Effect.succeed(input),
    resize: (input: Uint8Array, _options: ResizeVideoParams) =>
      Effect.succeed(input),
    trim: (input: Uint8Array, _options: TrimVideoParams) =>
      Effect.succeed(input),
    extractFrame: (
      _input: Uint8Array,
      _options: ExtractFrameVideoParams,
    ): Effect.Effect<Uint8Array, UploadistaError> => {
      throw new Error("Function not implemented.");
    },
    describe: (
      _input: Uint8Array,
    ): Effect.Effect<DescribeVideoMetadata, UploadistaError> => {
      throw new Error("Function not implemented.");
    },
  }),
);

// ============================================================================
// ExtractLayerService Tests
// ============================================================================

// Test: Should extract service from a single layer
expectType<ImagePlugin>({} as ExtractLayerService<typeof ImageLayer>);

expectType<ZipPlugin>({} as ExtractLayerService<typeof ZipLayer>);

// Test: Should return never for non-layer types
expectType<never>({} as ExtractLayerService<string>);
expectType<never>({} as ExtractLayerService<number>);
expectType<never>({} as ExtractLayerService<{}>);

// ============================================================================
// ExtractLayerServices Tests
// ============================================================================

// Test: Should extract union of services from layer tuple
expectType<ImagePlugin | ZipPlugin>(
  {} as ExtractLayerServices<[typeof ImageLayer, typeof ZipLayer]>,
);

expectType<ImagePlugin | ZipPlugin | VideoPlugin>(
  {} as ExtractLayerServices<
    [typeof ImageLayer, typeof ZipLayer, typeof VideoLayer]
  >,
);

// Test: Should handle single layer in tuple
expectType<ImagePlugin>({} as ExtractLayerServices<[typeof ImageLayer]>);

// Test: Should return never for empty tuple
type EmptyTuple = [];
type EmptyTupleExtracted = ExtractLayerServices<EmptyTuple>;
expectType<never>({} as EmptyTupleExtracted);

// Test: Should work with readonly arrays
expectType<ImagePlugin | ZipPlugin>(
  {} as ExtractLayerServices<readonly [typeof ImageLayer, typeof ZipLayer]>,
);

// ============================================================================
// ResolveEffect Tests
// ============================================================================

// Test: Should extract success type from Effect
expectType<string>({} as ResolveEffect<Effect.Effect<string, Error, never>>);

expectType<number>({} as ResolveEffect<Effect.Effect<number, never, never>>);

expectType<ImagePlugin>(
  {} as ResolveEffect<Effect.Effect<ImagePlugin, Error, ImagePlugin>>,
);

// Test: Should return the type itself if not an Effect
expectType<string>({} as ResolveEffect<string>);
expectType<number>({} as ResolveEffect<number>);
expectType<ImagePlugin>({} as ResolveEffect<ImagePlugin>);

// Test: Should work with nested structures
expectType<{ data: string }>(
  {} as ResolveEffect<Effect.Effect<{ data: string }, Error, never>>,
);

// ============================================================================
// ExtractEffectError Tests
// ============================================================================

// Test: Should extract error type from Effect
expectType<Error>(
  {} as ExtractEffectError<Effect.Effect<string, Error, never>>,
);

expectType<TypeError>(
  {} as ExtractEffectError<Effect.Effect<number, TypeError, never>>,
);

// Test: Should extract never for Effects with no error
expectType<never>(
  {} as ExtractEffectError<Effect.Effect<string, never, never>>,
);

// Test: Should return never for non-Effect types
expectType<never>({} as ExtractEffectError<string>);
expectType<never>({} as ExtractEffectError<number>);

// Test: Should handle union error types
expectType<Error | TypeError>(
  {} as ExtractEffectError<Effect.Effect<string, Error | TypeError, never>>,
);

// ============================================================================
// ExtractEffectRequirements Tests
// ============================================================================

// Test: Should extract requirements type from Effect
expectType<ImagePlugin>(
  {} as ExtractEffectRequirements<Effect.Effect<string, Error, ImagePlugin>>,
);

expectType<ZipPlugin>(
  {} as ExtractEffectRequirements<Effect.Effect<number, never, ZipPlugin>>,
);

// Test: Should extract never for Effects with no requirements
expectType<never>(
  {} as ExtractEffectRequirements<Effect.Effect<string, Error, never>>,
);

// Test: Should return never for non-Effect types
expectType<never>({} as ExtractEffectRequirements<string>);
expectType<never>({} as ExtractEffectRequirements<number>);

// Test: Should handle union requirement types
expectType<ImagePlugin | ZipPlugin>(
  {} as ExtractEffectRequirements<
    Effect.Effect<string, Error, ImagePlugin | ZipPlugin>
  >,
);

// Test: Should work with complex Effect chains
const complexEffect = Effect.gen(function* () {
  const imageService = yield* ImagePlugin;
  const zipService = yield* ZipPlugin;
  return { imageService, zipService };
});

expectType<ImagePlugin | ZipPlugin>(
  {} as ExtractEffectRequirements<typeof complexEffect>,
);

// ============================================================================
// Combined Usage Tests
// ============================================================================

// Test: Realistic flow scenario - extract requirements from plugin layers
const pluginLayers = [ImageLayer, ZipLayer] as const;

type PluginServices = ExtractLayerServices<typeof pluginLayers>;
expectType<ImagePlugin | ZipPlugin>({} as PluginServices);

// Test: Realistic flow scenario - validate Effect requirements match plugins
type FlowEffect = Effect.Effect<Buffer, Error, ImagePlugin | ZipPlugin>;
type FlowRequirements = ExtractEffectRequirements<FlowEffect>;

// This should compile: flow requirements are subset of plugin services
type ValidationTest = FlowRequirements extends PluginServices ? true : false;
expectType<true>({} as ValidationTest);

// Test: Should detect missing requirements
type IncompletePlugins = ExtractLayerServices<[typeof ImageLayer]>;
type MissingTest = ImagePlugin | ZipPlugin extends IncompletePlugins
  ? true
  : false;
expectType<false>({} as MissingTest);

// ============================================================================
// Edge Cases
// ============================================================================

// Test: Should handle optional types
expectType<string | undefined>(
  {} as ResolveEffect<Effect.Effect<string | undefined, Error, never>>,
);

// Test: Should handle null types
expectType<string | null>(
  {} as ResolveEffect<Effect.Effect<string | null, Error, never>>,
);

// Test: Should handle array types
expectType<string[]>(
  {} as ResolveEffect<Effect.Effect<string[], Error, never>>,
);

// Test: Should handle Promise-like types
expectType<Promise<string>>(
  {} as ResolveEffect<Effect.Effect<Promise<string>, Error, never>>,
);

// Test: Should handle generic types
function genericTest<T>() {
  expectType<T>({} as ResolveEffect<Effect.Effect<T, Error, never>>);
  expectType<Error>({} as ExtractEffectError<Effect.Effect<T, Error, never>>);
  expectType<ImagePlugin>(
    {} as ExtractEffectRequirements<Effect.Effect<T, Error, ImagePlugin>>,
  );
}

genericTest<string>();
genericTest<number>();
genericTest<ImagePlugin>();
genericTest<ZipPlugin>();
genericTest<VideoPlugin>();
