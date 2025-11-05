/**
 * Type tests for type-utils.ts
 *
 * These tests verify that type utilities work correctly with various inputs
 * and produce the expected output types. Tests use expectType assertions
 * to validate compile-time type behavior.
 */

import { Effect, Layer } from "effect";
import { expectType } from "tsd";
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

class ImageService {
  readonly _tag = "ImageService";
  resize(data: Buffer, width: number): Buffer {
    return data;
  }
}

class ZipService {
  readonly _tag = "ZipService";
  compress(files: Buffer[]): Buffer {
    return Buffer.from([]);
  }
}

class LogService {
  readonly _tag = "LogService";
  log(message: string): void {
    console.log(message);
  }
}

// Create test layers
const ImageLayer = Layer.succeed(ImageService, new ImageService());
const ZipLayer = Layer.succeed(ZipService, new ZipService());
const LogLayer = Layer.succeed(LogService, new LogService());

// ============================================================================
// ExtractLayerService Tests
// ============================================================================

// Test: Should extract service from a single layer
expectType<ImageService>({} as ExtractLayerService<typeof ImageLayer>);

expectType<ZipService>({} as ExtractLayerService<typeof ZipLayer>);

// Test: Should return never for non-layer types
expectType<never>({} as ExtractLayerService<string>);
expectType<never>({} as ExtractLayerService<number>);
expectType<never>({} as ExtractLayerService<{}>);

// ============================================================================
// ExtractLayerServices Tests
// ============================================================================

// Test: Should extract union of services from layer tuple
expectType<ImageService | ZipService>(
  {} as ExtractLayerServices<[typeof ImageLayer, typeof ZipLayer]>,
);

expectType<ImageService | ZipService | LogService>(
  {} as ExtractLayerServices<
    [typeof ImageLayer, typeof ZipLayer, typeof LogLayer]
  >,
);

// Test: Should handle single layer in tuple
expectType<ImageService>({} as ExtractLayerServices<[typeof ImageLayer]>);

// Test: Should return never for empty tuple
expectType<never>({} as ExtractLayerServices<[]>);

// Test: Should work with readonly arrays
expectType<ImageService | ZipService>(
  {} as ExtractLayerServices<readonly [typeof ImageLayer, typeof ZipLayer]>,
);

// ============================================================================
// ResolveEffect Tests
// ============================================================================

// Test: Should extract success type from Effect
expectType<string>({} as ResolveEffect<Effect.Effect<string, Error, never>>);

expectType<number>({} as ResolveEffect<Effect.Effect<number, never, never>>);

expectType<ImageService>(
  {} as ResolveEffect<Effect.Effect<ImageService, Error, ZipService>>,
);

// Test: Should return the type itself if not an Effect
expectType<string>({} as ResolveEffect<string>);
expectType<number>({} as ResolveEffect<number>);
expectType<ImageService>({} as ResolveEffect<ImageService>);

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
expectType<ImageService>(
  {} as ExtractEffectRequirements<Effect.Effect<string, Error, ImageService>>,
);

expectType<ZipService>(
  {} as ExtractEffectRequirements<Effect.Effect<number, never, ZipService>>,
);

// Test: Should extract never for Effects with no requirements
expectType<never>(
  {} as ExtractEffectRequirements<Effect.Effect<string, Error, never>>,
);

// Test: Should return never for non-Effect types
expectType<never>({} as ExtractEffectRequirements<string>);
expectType<never>({} as ExtractEffectRequirements<number>);

// Test: Should handle union requirement types
expectType<ImageService | ZipService>(
  {} as ExtractEffectRequirements<
    Effect.Effect<string, Error, ImageService | ZipService>
  >,
);

// Test: Should work with complex Effect chains
const complexEffect = Effect.gen(function* () {
  const imageService = yield* ImageService;
  const zipService = yield* ZipService;
  return { imageService, zipService };
});

expectType<ImageService | ZipService>(
  {} as ExtractEffectRequirements<typeof complexEffect>,
);

// ============================================================================
// Combined Usage Tests
// ============================================================================

// Test: Realistic flow scenario - extract requirements from plugin layers
const pluginLayers = [ImageLayer, ZipLayer] as const;

type PluginServices = ExtractLayerServices<typeof pluginLayers>;
expectType<ImageService | ZipService>({} as PluginServices);

// Test: Realistic flow scenario - validate Effect requirements match plugins
type FlowEffect = Effect.Effect<Buffer, Error, ImageService | ZipService>;
type FlowRequirements = ExtractEffectRequirements<FlowEffect>;

// This should compile: flow requirements are subset of plugin services
type ValidationTest = FlowRequirements extends PluginServices ? true : false;
expectType<true>({} as ValidationTest);

// Test: Should detect missing requirements
type IncompletePlugins = ExtractLayerServices<[typeof ImageLayer]>;
type MissingTest = ImageService | ZipService extends IncompletePlugins
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
  expectType<ImageService>(
    {} as ExtractEffectRequirements<Effect.Effect<T, Error, ImageService>>,
  );
}
