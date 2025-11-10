/**
 * Type tests for plugin-types.ts
 *
 * These tests verify that plugin type utilities correctly validate plugin
 * requirements and generate appropriate error messages at compile time.
 */

import {
  type DescribeVideoMetadata,
  type ExtractFrameVideoParams,
  ImagePlugin,
  type OptimizeParams,
  type ResizeParams,
  type ResizeVideoParams,
  type TranscodeVideoParams,
  type Transformation,
  type TrimVideoParams,
  type UploadistaError,
  VideoPlugin,
  type ZipInput,
  type ZipParams,
  ZipPlugin,
} from "@uploadista/core";
import { Effect, Layer } from "effect";
import { expectType } from "tsd";
import type {
  ExtractFlowPluginRequirements,
  InferFlowRequirements,
  PluginServices,
  PluginTuple,
  TypeSafeFlowFunction,
  ValidatePlugins,
} from "../src/core/plugin-types";

// ============================================================================
// Test Services and Layers
// ============================================================================

const imageLayer = Layer.succeed(
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
const zipLayer = Layer.succeed(
  ZipPlugin,
  ZipPlugin.of({
    zip: (_inputs: ZipInput[], _options: ZipParams) =>
      Effect.succeed(new Uint8Array([])),
  }),
);
const videoLayer = Layer.succeed(
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
// PluginTuple Tests
// ============================================================================

// Test: Should accept valid plugin tuples
expectType<PluginTuple>([imageLayer] as const);
expectType<PluginTuple>([imageLayer, zipLayer] as const);
expectType<PluginTuple>([imageLayer, zipLayer, videoLayer] as const);

// Test: Should accept empty tuple
expectType<PluginTuple>([] as const);

// ============================================================================
// PluginServices Tests
// ============================================================================

// Test: Should extract union of services from plugin tuple
expectType<ImagePlugin>({} as PluginServices<[typeof imageLayer]>);

expectType<ImagePlugin | ZipPlugin>(
  {} as PluginServices<[typeof imageLayer, typeof zipLayer]>,
);

expectType<ImagePlugin | ZipPlugin | VideoPlugin>(
  {} as PluginServices<[typeof imageLayer, typeof zipLayer, typeof videoLayer]>,
);

// Test: Should return never for empty tuple
expectType<never>({} as PluginServices<[]>);

// ============================================================================
// TypeSafeFlowFunction Tests
// ============================================================================

// Test: Should accept flow functions with matching requirements
const imageFlowFn: TypeSafeFlowFunction<ImagePlugin> = (
  flowId: string,
  clientId: string,
) =>
  Effect.gen(function* () {
    const image = yield* ImagePlugin;
    return {} as any;
  });

expectType<TypeSafeFlowFunction<ImagePlugin>>(imageFlowFn);

const multiPluginFlowFn: TypeSafeFlowFunction<ImagePlugin | ZipPlugin> = (
  flowId: string,
  clientId: string,
) =>
  Effect.gen(function* () {
    const image = yield* ImagePlugin;
    const zip = yield* ZipPlugin;
    return {} as any;
  });

expectType<TypeSafeFlowFunction<ImagePlugin | ZipPlugin>>(multiPluginFlowFn);

// Test: Should accept flow with no requirements
const noPluginFlowFn: TypeSafeFlowFunction<never> = (
  flowId: string,
  clientId: string,
) => Effect.succeed({} as any);

expectType<TypeSafeFlowFunction<never>>(noPluginFlowFn);

// ============================================================================
// ValidatePlugins Tests - Success Cases
// ============================================================================

// Test: Should return true when all requirements are satisfied
type ValidSinglePlugin = ValidatePlugins<[typeof imageLayer], ImagePlugin>;
expectType<true>({} as ValidSinglePlugin);

type ValidMultiplePlugins = ValidatePlugins<
  [typeof imageLayer, typeof zipLayer],
  ImagePlugin | ZipPlugin
>;
expectType<true>({} as ValidMultiplePlugins);

// Test: Should return true when plugins provide more than required
type ValidExtraPlugins = ValidatePlugins<
  [typeof imageLayer, typeof zipLayer, typeof videoLayer],
  ImagePlugin | ZipPlugin
>;
expectType<true>({} as ValidExtraPlugins);

// Test: Should return true when no requirements
type ValidNoRequirements = ValidatePlugins<[typeof imageLayer], never>;
expectType<true>({} as ValidNoRequirements);

type ValidEmptyPluginsNoRequirements = ValidatePlugins<[], never>;
expectType<true>({} as ValidEmptyPluginsNoRequirements);

// ============================================================================
// ValidatePlugins Tests - Error Cases
// ============================================================================

// Test: Should return error object when plugins are missing
type MissingSinglePlugin = ValidatePlugins<[], ImagePlugin>;

// Should NOT be true
type MissingSinglePluginIsTrue = MissingSinglePlugin extends true
  ? true
  : false;
expectType<false>({} as MissingSinglePluginIsTrue);

// Should have error properties
expectType<"MISSING_REQUIRED_PLUGINS">(
  {} as MissingSinglePlugin extends { readonly __error: infer E } ? E : never,
);

expectType<"Missing required plugins. Check __missing field for details.">(
  {} as MissingSinglePlugin extends { readonly __message: infer M } ? M : never,
);

expectType<ImagePlugin>(
  {} as MissingSinglePlugin extends { readonly __required: infer R }
    ? R
    : never,
);

expectType<never>(
  {} as MissingSinglePlugin extends { readonly __provided: infer P }
    ? P
    : never,
);

expectType<ImagePlugin>(
  {} as MissingSinglePlugin extends { readonly __missing: infer M } ? M : never,
);

expectType<"Add the missing plugins to your server configuration's plugins array.">(
  {} as MissingSinglePlugin extends { readonly __hint: infer H } ? H : never,
);

// Test: Should show partial missing plugins
type PartiallyMissingPlugins = ValidatePlugins<
  [typeof imageLayer],
  ImagePlugin | ZipPlugin
>;

expectType<ZipPlugin>(
  {} as PartiallyMissingPlugins extends { readonly __missing: infer M }
    ? M
    : never,
);

expectType<ImagePlugin>(
  {} as PartiallyMissingPlugins extends { readonly __provided: infer P }
    ? P
    : never,
);

// Test: Should show all missing plugins
type AllMissingPlugins = ValidatePlugins<
  [],
  ImagePlugin | ZipPlugin | VideoPlugin
>;

expectType<ImagePlugin | ZipPlugin | VideoPlugin>(
  {} as AllMissingPlugins extends { readonly __missing: infer M } ? M : never,
);

// ============================================================================
// ExtractFlowPluginRequirements Tests
// ============================================================================

// Test: Should extract requirements from flow function
type ImageFlowRequirements = ExtractFlowPluginRequirements<typeof imageFlowFn>;
expectType<ImagePlugin>({} as ImageFlowRequirements);

type MultiPluginFlowRequirements = ExtractFlowPluginRequirements<
  typeof multiPluginFlowFn
>;
expectType<ImagePlugin | ZipPlugin>({} as MultiPluginFlowRequirements);

type NoPluginFlowRequirements = ExtractFlowPluginRequirements<
  typeof noPluginFlowFn
>;
expectType<never>({} as NoPluginFlowRequirements);

// ============================================================================
// InferFlowRequirements Tests
// ============================================================================

// Test: Should infer requirements from flow function type
type InferredImageFlow = InferFlowRequirements<typeof imageFlowFn>;
expectType<ImagePlugin>({} as InferredImageFlow);

type InferredMultiFlow = InferFlowRequirements<typeof multiPluginFlowFn>;
expectType<ImagePlugin | ZipPlugin>({} as InferredMultiFlow);

type InferredNoPluginFlow = InferFlowRequirements<typeof noPluginFlowFn>;
expectType<never>({} as InferredNoPluginFlow);

// ============================================================================
// Integration Tests - Realistic Usage Scenarios
// ============================================================================

// Scenario 1: Valid server configuration
const validPlugins = [imageLayer, zipLayer] as const;
const validFlow: TypeSafeFlowFunction<ImagePlugin | ZipPlugin> = (
  flowId,
  clientId,
) =>
  Effect.gen(function* () {
    yield* ImagePlugin;
    yield* ZipPlugin;
    return {} as any;
  });

type ValidConfig = ValidatePlugins<
  typeof validPlugins,
  ExtractFlowPluginRequirements<typeof validFlow>
>;
expectType<true>({} as ValidConfig);

// Scenario 2: Invalid server configuration - missing plugin
const incompletePlugins = [imageLayer] as const;
const multiPluginFlow: TypeSafeFlowFunction<ImagePlugin | ZipPlugin> = (
  flowId,
  clientId,
) =>
  Effect.gen(function* () {
    yield* ImagePlugin;
    yield* ZipPlugin;
    return {} as any;
  });

type InvalidConfig = ValidatePlugins<
  typeof incompletePlugins,
  ExtractFlowPluginRequirements<typeof multiPluginFlow>
>;

// Should fail validation
type InvalidConfigIsTrue = InvalidConfig extends true ? true : false;
expectType<false>({} as InvalidConfigIsTrue);

// Should show ZipPlugin as missing
expectType<ZipPlugin>(
  {} as InvalidConfig extends { readonly __missing: infer M } ? M : never,
);

// Scenario 3: Valid configuration with extra plugins
const extraPlugins = [imageLayer, zipLayer, videoLayer] as const;
const simpleFlow: TypeSafeFlowFunction<ImagePlugin> = (flowId, clientId) =>
  Effect.gen(function* () {
    yield* ImagePlugin;
    return {} as any;
  });

type ExtraPluginsConfig = ValidatePlugins<
  typeof extraPlugins,
  ExtractFlowPluginRequirements<typeof simpleFlow>
>;
expectType<true>({} as ExtraPluginsConfig);

// Scenario 4: No plugins, no requirements - valid
const noPlugins = [] as const;
const noRequirementsFlow: TypeSafeFlowFunction<never> = (flowId, clientId) =>
  Effect.succeed({} as any);

type NoPluginsConfig = ValidatePlugins<
  typeof noPlugins,
  ExtractFlowPluginRequirements<typeof noRequirementsFlow>
>;
expectType<true>({} as NoPluginsConfig);

// ============================================================================
// Error Message Quality Tests
// ============================================================================

// Test: Error messages should be descriptive and actionable
type ErrorWithGoodMessages = ValidatePlugins<[], ImagePlugin | ZipPlugin>;

// Verify all required error properties exist
type HasError = ErrorWithGoodMessages extends {
  readonly __error: string;
  readonly __message: string;
  readonly __required: unknown;
  readonly __provided: unknown;
  readonly __missing: unknown;
  readonly __hint: string;
}
  ? true
  : false;
expectType<true>({} as HasError);

// Verify error code is specific
type ErrorCode = ErrorWithGoodMessages extends {
  readonly __error: "MISSING_REQUIRED_PLUGINS";
}
  ? true
  : false;
expectType<true>({} as ErrorCode);

// Verify message is helpful
type HasHelpfulMessage = ErrorWithGoodMessages extends {
  readonly __message: "Missing required plugins. Check __missing field for details.";
}
  ? true
  : false;
expectType<true>({} as HasHelpfulMessage);

// Verify hint is actionable
type HasActionableHint = ErrorWithGoodMessages extends {
  readonly __hint: "Add the missing plugins to your server configuration's plugins array.";
}
  ? true
  : false;
expectType<true>({} as HasActionableHint);

// ============================================================================
// Edge Cases
// ============================================================================

// Test: Union of multiple requirements
type UnionRequirements = ValidatePlugins<
  [typeof imageLayer],
  ImagePlugin | ZipPlugin | VideoPlugin
>;

expectType<ZipPlugin | VideoPlugin>(
  {} as UnionRequirements extends { readonly __missing: infer M } ? M : never,
);

// Test: Complex nested requirements
type ComplexFlow = TypeSafeFlowFunction<
  ImagePlugin | (ZipPlugin & { optional?: boolean })
>;
type ComplexRequirements = ExtractFlowPluginRequirements<ComplexFlow>;

// Should extract the union properly
type IsValidComplexExtraction = ComplexRequirements extends
  | ImagePlugin
  | ZipPlugin
  ? true
  : false;
expectType<true>({} as IsValidComplexExtraction);
