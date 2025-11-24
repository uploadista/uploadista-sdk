/**
 * Utilities for building FlowInputs from raw input data with automatic type detection.
 *
 * @module utils/flow-inputs-builder
 */

import type { FlowInputs } from "../types/flow-inputs";
import { detectInputType, isFileLike } from "./input-detection";

/**
 * Build FlowInputs mapping from raw input data with automatic type detection.
 *
 * Automatically detects input types and builds correct operation objects:
 * - File/Blob → `{ operation: "init", storageId, metadata }`
 * - URL string → `{ operation: "url", url, storageId }`
 * - Other data → passed through unchanged
 *
 * @param inputs - Map of nodeId to raw input data
 * @param storageId - Storage ID for file uploads and URL operations
 * @returns FlowInputs with properly formatted operations
 *
 * @example
 * ```typescript
 * // Single file input
 * const inputs = buildFlowInputs(
 *   { "file-input": myFile },
 *   "s3-storage"
 * );
 * // Returns: { "file-input": { operation: "init", storageId: "s3-storage", metadata: {...} } }
 *
 * // Multiple mixed inputs
 * const inputs = buildFlowInputs(
 *   {
 *     "file-input": myFile,
 *     "url-input": "https://example.com/image.jpg",
 *     "data-input": { customField: "value" }
 *   },
 *   "s3-storage"
 * );
 * ```
 */
export function buildFlowInputs(
  inputs: Record<string, unknown>,
  storageId: string,
): FlowInputs {
  const flowInputs: FlowInputs = {};

  for (const [nodeId, data] of Object.entries(inputs)) {
    const inputType = detectInputType(data);

    switch (inputType) {
      case "file": {
        // File-like object → init operation with metadata
        if (isFileLike(data)) {
          const file = data;
          const metadata: Record<string, unknown> = {
            originalName:
              "name" in file && typeof file.name === "string"
                ? file.name
                : "file",
            mimeType:
              "type" in file && typeof file.type === "string"
                ? file.type
                : "application/octet-stream",
            size: "size" in file && typeof file.size === "number" ? file.size : 0,
          };

          flowInputs[nodeId] = {
            operation: "init",
            storageId,
            metadata,
          };
        }
        break;
      }

      case "url": {
        // URL string → url operation
        flowInputs[nodeId] = {
          operation: "url",
          url: data as string,
          storageId,
        };
        break;
      }

      case "data": {
        // Structured data → pass through unchanged
        flowInputs[nodeId] = data;
        break;
      }
    }
  }

  return flowInputs;
}

/**
 * Build FlowInputs for a single input with auto-discovered node ID.
 *
 * @param nodeId - The input node ID
 * @param data - Raw input data
 * @param storageId - Storage ID for file uploads and URL operations
 * @returns FlowInputs with single entry
 *
 * @example
 * ```typescript
 * const inputs = buildSingleFlowInput("file-input", myFile, "s3-storage");
 * // Returns: { "file-input": { operation: "init", storageId: "s3-storage", metadata: {...} } }
 * ```
 */
export function buildSingleFlowInput(
  nodeId: string,
  data: unknown,
  storageId: string,
): FlowInputs {
  return buildFlowInputs({ [nodeId]: data }, storageId);
}
