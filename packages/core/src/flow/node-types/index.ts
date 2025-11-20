/**
 * Built-in node type registrations for the flow engine.
 *
 * This module automatically registers the standard input and output node types
 * when imported. These types enable type-safe result consumption in clients.
 *
 * @module flow/node-types
 *
 * @remarks
 * This module should be imported by the flow engine initialization to ensure
 * built-in types are registered before any flows are created.
 *
 * @example
 * ```typescript
 * // Types are automatically registered on import
 * import "@uploadista/core/flow/node-types";
 * import { flowTypeRegistry } from "@uploadista/core/flow";
 *
 * // Check registered types
 * const inputTypes = flowTypeRegistry.listByCategory("input");
 * console.log(inputTypes.map(t => t.id)); // ["storage-output-v1"]
 * ```
 */

import { uploadFileSchema } from "../../types/upload-file";
import { flowTypeRegistry } from "../type-registry";

/**
 * Type ID constants for built-in node types.
 *
 * Use these constants when creating nodes with type information to ensure
 * consistency and avoid typos.
 *
 * @example
 * ```typescript
 * import { STREAMING_INPUT_TYPE_ID } from "@uploadista/core/flow/node-types";
 *
 * const inputNode = createFlowNode({
 *   // ... other config
 *   nodeTypeId: STREAMING_INPUT_TYPE_ID
 * });
 * ```
 */
export const STORAGE_OUTPUT_TYPE_ID = "storage-output-v1";

/**
 * Register storage output node type.
 *
 * This is the standard output type for flows that save files to storage backends
 * (S3, Azure, GCS, etc.). It produces UploadFile objects with final storage URLs.
 */
flowTypeRegistry.register({
  id: STORAGE_OUTPUT_TYPE_ID,
  category: "output",
  schema: uploadFileSchema,
  version: "1.0.0",
  description:
    "Storage output node that saves files to configured storage backend",
});

/**
 * Future type registrations can be added here.
 *
 * Examples:
 * - description-output-v1: AI-powered image description output
 * - webhook-output-v1: HTTP webhook notification output
 * - metadata-output-v1: File metadata extraction output
 */

// Export the registry for convenience
export { flowTypeRegistry } from "../type-registry";
