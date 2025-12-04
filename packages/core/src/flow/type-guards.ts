/**
 * Type guards and helpers for safe type narrowing of flow results and inputs.
 *
 * This module provides runtime type guards for discriminating between different
 * types of flow outputs and input operations. Type guards validate both the type
 * tag and the data structure against registered schemas.
 *
 * @module flow/type-guards
 *
 * @example
 * ```typescript
 * import { isStorageOutput, filterOutputsByType, isUrlOperation } from "@uploadista/core/flow";
 *
 * // Type-safe output result consumption
 * if (result.success && result.flowOutputs) {
 *   const storageOutputs = filterOutputsByType(result.flowOutputs, isStorageOutput);
 *   for (const output of storageOutputs) {
 *     // output.data is typed as UploadFile
 *     console.log("Stored at:", output.data.url);
 *   }
 * }
 *
 * // Type-safe input operation handling
 * if (isUrlOperation(inputData)) {
 *   // TypeScript knows inputData has url property
 *   console.log("Fetching from", inputData.url);
 * }
 * ```
 */

import { Effect } from "effect";
import { UploadistaError } from "../errors";
import type { UploadFile } from "../types";
import { uploadFileSchema } from "../types";
import {
  IMAGE_DESCRIPTION_OUTPUT_TYPE_ID,
  type ImageDescriptionOutput,
  OCR_OUTPUT_TYPE_ID,
  type OcrOutput,
} from "./node-types";
import type { InputData } from "./nodes/input-node";
import { outputTypeRegistry } from "./output-type-registry";
import type { TypedOutput } from "./types/flow-types";

/**
 * A narrowed typed output with a specific node type and data type.
 * Unlike TypedOutput<T>, this type has a required nodeType field and
 * excludes BuiltInTypedOutput from the union, providing better type narrowing.
 *
 * @template T - The TypeScript type of the output data
 * @template TNodeType - The literal string type of the node type ID
 */
export type NarrowedTypedOutput<T, TNodeType extends string = string> = {
  nodeType: TNodeType;
  data: T;
  nodeId: string;
  timestamp: string;
};

/**
 * Factory function to create type guards for specific node types.
 *
 * Creates a TypeScript type guard that validates both the type tag and
 * the data structure against the registered schema. This enables type-safe
 * narrowing of TypedOutput objects in TypeScript.
 *
 * @template T - The expected TypeScript type after narrowing
 * @template TNodeType - The literal string type of the node type ID
 * @param typeId - The registered type ID to check against (e.g., "storage-output-v1")
 * @returns A type guard function that narrows TypedOutput to NarrowedTypedOutput<T, TNodeType>
 *
 * @example
 * ```typescript
 * import { createTypeGuard } from "@uploadista/core/flow";
 * import { z } from "zod";
 *
 * const descriptionSchema = z.object({
 *   description: z.string(),
 *   confidence: z.number(),
 * });
 *
 * type DescriptionOutput = z.infer<typeof descriptionSchema>;
 *
 * const isDescriptionOutput = createTypeGuard<DescriptionOutput>(
 *   "description-output-v1"
 * );
 *
 * // Use in code
 * if (isDescriptionOutput(output)) {
 *   // output.data is typed as DescriptionOutput
 *   console.log(output.data.description);
 * }
 * ```
 */
export function createTypeGuard<T, TNodeType extends string = string>(
  typeId: TNodeType,
): (output: TypedOutput) => output is NarrowedTypedOutput<T, TNodeType> {
  return (output: TypedOutput): output is NarrowedTypedOutput<T, TNodeType> => {
    // Check type matches
    if (output.nodeType !== typeId) return false;

    // Validate against registered schema
    const typeDef = outputTypeRegistry.get(typeId);
    if (!typeDef) return false;

    const result = typeDef.schema.safeParse(output.data);
    return result.success;
  };
}

/**
 * Type guard for UploadFile objects.
 *
 * Validates that a value is a valid UploadFile by checking its structure against the schema.
 * This is useful for determining if a node result is an UploadFile, which affects
 * auto-persistence and intermediate file tracking.
 *
 * @param value - The value to check
 * @returns True if the value is a valid UploadFile
 *
 * @example
 * ```typescript
 * import { isUploadFile } from "@uploadista/core/flow";
 *
 * if (isUploadFile(nodeResult)) {
 *   // nodeResult is typed as UploadFile
 *   console.log("File ID:", nodeResult.id);
 *   console.log("Storage:", nodeResult.storage.id);
 * }
 * ```
 */
export function isUploadFile(value: unknown): value is UploadFile {
  if (!value || typeof value !== "object") return false;
  const result = uploadFileSchema.safeParse(value);
  return result.success;
}

/**
 * Type guard for storage output nodes.
 *
 * Validates that an output is from a storage node and contains valid UploadFile data.
 *
 * @param output - The output to check
 * @returns True if the output is a storage output with valid UploadFile data
 *
 * @example
 * ```typescript
 * import { isStorageOutput } from "@uploadista/core/flow";
 *
 * if (isStorageOutput(output)) {
 *   // output.data is typed as UploadFile
 *   console.log("File URL:", output.data.url);
 *   console.log("File size:", output.data.size);
 * }
 * ```
 */
export const isStorageOutput = createTypeGuard<UploadFile>("storage-output-v1");

/**
 * Type guard for OCR output nodes.
 *
 * Validates that an output is from an OCR node and contains valid structured OCR data.
 *
 * @param output - The output to check
 * @returns True if the output is an OCR output with valid structured text data
 *
 * @example
 * ```typescript
 * import { isOcrOutput } from "@uploadista/core/flow";
 *
 * if (isOcrOutput(output)) {
 *   // output.data is typed as OcrOutput
 *   console.log("Extracted text:", output.data.extractedText);
 *   console.log("Format:", output.data.format);
 *   console.log("Task type:", output.data.taskType);
 * }
 * ```
 */
export const isOcrOutput = createTypeGuard<OcrOutput>(OCR_OUTPUT_TYPE_ID);

/**
 * Type guard for image description output nodes.
 *
 * Validates that an output is from an image description node and contains valid description data.
 *
 * @param output - The output to check
 * @returns True if the output is an image description output with valid description data
 *
 * @example
 * ```typescript
 * import { isImageDescriptionOutput } from "@uploadista/core/flow";
 *
 * if (isImageDescriptionOutput(output)) {
 *   // output.data is typed as ImageDescriptionOutput
 *   console.log("Description:", output.data.description);
 *   console.log("Confidence:", output.data.confidence);
 * }
 * ```
 */
export const isImageDescriptionOutput = createTypeGuard<ImageDescriptionOutput>(
  IMAGE_DESCRIPTION_OUTPUT_TYPE_ID,
);

/**
 * Filter an array of outputs to only those matching a specific type.
 *
 * This helper function filters outputs using a type guard and returns a
 * properly typed array of results. It's useful for extracting specific
 * output types from multi-output flows.
 *
 * @template TOutput - The expected narrowed output type
 * @param outputs - Array of typed outputs to filter
 * @param typeGuard - Type guard function to use for filtering
 * @returns Array of outputs that match the type guard, properly typed
 *
 * @example
 * ```typescript
 * import { filterOutputsByType, isStorageOutput } from "@uploadista/core/flow";
 *
 * // Get all storage outputs from a multi-output flow
 * const storageOutputs = filterOutputsByType(
 *   flowResult.outputs,
 *   isStorageOutput
 * );
 *
 * for (const output of storageOutputs) {
 *   // Each output.data is typed as UploadFile
 *   console.log("Saved file:", output.data.url);
 * }
 * ```
 */
export function filterOutputsByType<TOutput extends TypedOutput>(
  outputs: TypedOutput[],
  typeGuard: (output: TypedOutput) => output is TOutput,
): TOutput[] {
  return outputs.filter(typeGuard);
}

/**
 * Get a single output of a specific type from an array of outputs.
 *
 * This helper function finds exactly one output matching the type guard.
 * It throws an error if no outputs match or if multiple outputs match,
 * ensuring the caller receives exactly the expected result.
 *
 * @template TOutput - The expected narrowed output type
 * @param outputs - Array of typed outputs to search
 * @param typeGuard - Type guard function to use for matching
 * @returns The single matching output, properly typed
 * @throws {UploadistaError} If no outputs match (OUTPUT_NOT_FOUND)
 * @throws {UploadistaError} If multiple outputs match (MULTIPLE_OUTPUTS_FOUND)
 *
 * @example
 * ```typescript
 * import { getSingleOutputByType, isStorageOutput } from "@uploadista/core/flow";
 *
 * try {
 *   const storageOutput = getSingleOutputByType(
 *     flowResult.outputs,
 *     isStorageOutput
 *   );
 *   // storageOutput.data is typed as UploadFile
 *   console.log("File saved at:", storageOutput.data.url);
 * } catch (error) {
 *   if (error.code === "OUTPUT_NOT_FOUND") {
 *     console.error("No storage output found");
 *   } else if (error.code === "MULTIPLE_OUTPUTS_FOUND") {
 *     console.error("Multiple storage outputs found, expected one");
 *   }
 * }
 * ```
 */
export function getSingleOutputByType<TOutput extends TypedOutput>(
  outputs: TypedOutput[],
  typeGuard: (output: TypedOutput) => output is TOutput,
): Effect.Effect<TOutput, UploadistaError> {
  return Effect.gen(function* () {
    const filtered = filterOutputsByType(outputs, typeGuard);

    if (filtered.length === 0) {
      return yield* UploadistaError.fromCode("OUTPUT_NOT_FOUND", {
        body: "No output of the specified type was found in the flow results",
      }).toEffect();
    }

    if (filtered.length > 1) {
      return yield* UploadistaError.fromCode("MULTIPLE_OUTPUTS_FOUND", {
        body: `Found ${filtered.length} outputs of the specified type, expected exactly one`,
        details: {
          foundCount: filtered.length,
          nodeIds: filtered.map((o) => o.nodeId),
        },
      }).toEffect();
    }

    // TypeScript knows filtered.length is 1 here due to the checks above
    // biome-ignore lint/style/noNonNullAssertion: We've checked the length above
    return filtered[0]!;
  });
}

/**
 * Get the first output of a specific type, if any exists.
 *
 * Unlike getSingleOutputByType, this function returns undefined if no outputs
 * match, and returns the first match if multiple outputs exist. This is useful
 * when you want a more lenient matching strategy.
 *
 * @template TOutput - The expected narrowed output type
 * @param outputs - Array of typed outputs to search
 * @param typeGuard - Type guard function to use for matching
 * @returns The first matching output, or undefined if none match
 *
 * @example
 * ```typescript
 * import { getFirstOutputByType, isStorageOutput } from "@uploadista/core/flow";
 *
 * const storageOutput = getFirstOutputByType(
 *   flowResult.outputs,
 *   isStorageOutput
 * );
 *
 * if (storageOutput) {
 *   console.log("First storage output:", storageOutput.data.url);
 * } else {
 *   console.log("No storage outputs found");
 * }
 * ```
 */
export function getFirstOutputByType<TOutput extends TypedOutput>(
  outputs: TypedOutput[],
  typeGuard: (output: TypedOutput) => output is TOutput,
): TOutput | undefined {
  const filtered = filterOutputsByType(outputs, typeGuard);
  return filtered[0];
}

/**
 * Get an output by its node ID.
 *
 * This helper finds an output produced by a specific node instance,
 * regardless of its type. Useful when you know the specific node ID
 * you're looking for.
 *
 * @param outputs - Array of typed outputs to search
 * @param nodeId - The node ID to match
 * @returns The output from the specified node, or undefined if not found
 *
 * @example
 * ```typescript
 * import { getOutputByNodeId } from "@uploadista/core/flow";
 *
 * const cdnOutput = getOutputByNodeId(flowResult.outputs, "cdn-storage");
 * if (cdnOutput) {
 *   console.log("CDN output:", cdnOutput.data);
 * }
 * ```
 */
export function getOutputByNodeId(
  outputs: TypedOutput[],
  nodeId: string,
): TypedOutput | undefined {
  return outputs.find((output) => output.nodeId === nodeId);
}

/**
 * Check if any outputs match a specific type.
 *
 * Simple predicate function to check if at least one output of a given
 * type exists in the results.
 *
 * @template TOutput - The expected narrowed output type
 * @param outputs - Array of typed outputs to check
 * @param typeGuard - Type guard function to use for checking
 * @returns True if at least one output matches the type guard
 *
 * @example
 * ```typescript
 * import { hasOutputOfType, isStorageOutput } from "@uploadista/core/flow";
 *
 * if (hasOutputOfType(flowResult.outputs, isStorageOutput)) {
 *   console.log("Flow produced at least one storage output");
 * } else {
 *   console.log("No storage outputs in this flow");
 * }
 * ```
 */
export function hasOutputOfType<TOutput extends TypedOutput>(
  outputs: TypedOutput[],
  typeGuard: (output: TypedOutput) => output is TOutput,
): boolean {
  return outputs.some(typeGuard);
}

// ============================================================================
// Input Operation Type Guards
// ============================================================================

/**
 * Type guard for init operation (streaming file upload initialization).
 *
 * Checks if the input data is an init operation that starts a streaming
 * file upload session.
 *
 * @param data - Input data to check
 * @returns True if data is an init operation
 *
 * @example
 * ```typescript
 * if (isInitOperation(inputData)) {
 *   console.log("Storage ID:", inputData.storageId);
 *   console.log("Metadata:", inputData.metadata);
 * }
 * ```
 */
export function isInitOperation(
  data: InputData,
): data is Extract<InputData, { operation: "init" }> {
  return data.operation === "init";
}

/**
 * Type guard for finalize operation (complete streaming upload).
 *
 * Checks if the input data is a finalize operation that completes a
 * previously initialized streaming upload.
 *
 * @param data - Input data to check
 * @returns True if data is a finalize operation
 *
 * @example
 * ```typescript
 * if (isFinalizeOperation(inputData)) {
 *   console.log("Upload ID:", inputData.uploadId);
 * }
 * ```
 */
export function isFinalizeOperation(
  data: InputData,
): data is Extract<InputData, { operation: "finalize" }> {
  return data.operation === "finalize";
}

/**
 * Type guard for URL operation (direct file fetch from URL).
 *
 * Checks if the input data is a URL operation that fetches a file
 * directly from an external URL.
 *
 * @param data - Input data to check
 * @returns True if data is a URL operation
 *
 * @example
 * ```typescript
 * if (isUrlOperation(inputData)) {
 *   console.log("Fetching from:", inputData.url);
 *   console.log("Optional storage:", inputData.storageId);
 * }
 * ```
 */
export function isUrlOperation(
  data: InputData,
): data is Extract<InputData, { operation: "url" }> {
  return data.operation === "url";
}

/**
 * Type guard for upload operations (init or url).
 *
 * Checks if the input data is either an init or URL operation (i.e., operations
 * that trigger new uploads, as opposed to finalize which completes an existing upload).
 *
 * @param data - Input data to check
 * @returns True if data is an init or URL operation
 *
 * @example
 * ```typescript
 * if (isUploadOperation(inputData)) {
 *   // This is a new upload, not a finalization
 *   if (isInitOperation(inputData)) {
 *     console.log("Streaming upload");
 *   } else {
 *     console.log("URL fetch");
 *   }
 * }
 * ```
 */
export function isUploadOperation(
  data: InputData,
): data is Extract<InputData, { operation: "init" | "url" }> {
  return data.operation === "init" || data.operation === "url";
}
