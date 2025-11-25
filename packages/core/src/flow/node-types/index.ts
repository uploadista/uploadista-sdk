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
 * import "@uploadista/core/flow";
 * import { flowTypeRegistry } from "@uploadista/core/flow";
 *
 * // Check registered types
 * const inputTypes = flowTypeRegistry.listByCategory("input");
 * console.log(inputTypes.map(t => t.id)); // ["storage-output-v1"]
 * ```
 */

import { z } from "zod";
import { uploadFileSchema } from "../../types/upload-file";
import { inputDataSchema } from "../nodes/input-node";
import { flowTypeRegistry } from "../type-registry";

/**
 * Type ID constants for built-in node types.
 *
 * Use these constants when creating nodes with type information to ensure
 * consistency and avoid typos.
 *
 * @example
 * ```typescript
 * import { STREAMING_INPUT_TYPE_ID } from "@uploadista/core/flow";
 *
 * const inputNode = createFlowNode({
 *   // ... other config
 *   nodeTypeId: STREAMING_INPUT_TYPE_ID
 * });
 * ```
 */
export const STORAGE_OUTPUT_TYPE_ID = "storage-output-v1";
export const OCR_OUTPUT_TYPE_ID = "ocr-output-v1";
export const IMAGE_DESCRIPTION_OUTPUT_TYPE_ID = "image-description-output-v1";
export const STREAMING_INPUT_TYPE_ID = "streaming-input-v1";

/**
 * OCR output schema - structured text extraction result.
 *
 * @property extractedText - The text extracted from the document
 * @property format - Output format (text, markdown, or JSON)
 * @property taskType - Type of OCR task performed
 * @property confidence - Optional confidence score (0-1)
 */
export const ocrOutputSchema = z.object({
  extractedText: z.string(),
  format: z.enum(["markdown", "plain", "structured"]),
  taskType: z.enum([
    "convertToMarkdown",
    "freeOcr",
    "parseFigure",
    "locateObject",
  ]),
  confidence: z.number().min(0).max(1).optional(),
});

export type OcrOutput = z.infer<typeof ocrOutputSchema>;

/**
 * Image description output schema - AI-generated image analysis result.
 *
 * @property description - Human-readable description of the image
 * @property confidence - Confidence score for the description (0-1)
 * @property metadata - Additional metadata about the description
 */
export const imageDescriptionOutputSchema = z.object({
  description: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ImageDescriptionOutput = z.infer<
  typeof imageDescriptionOutputSchema
>;

/**
 * Register streaming input node type.
 *
 * This is the standard input type for flows that accept file uploads via
 * streaming chunks or direct URL fetches. It supports three operations:
 * - init: Initialize a streaming file upload session
 * - finalize: Complete the upload after all chunks are uploaded
 * - url: Fetch a file directly from a URL
 */
flowTypeRegistry.register({
  id: STREAMING_INPUT_TYPE_ID,
  category: "input",
  schema: inputDataSchema,
  version: "1.0.0",
  description:
    "Streaming file input with init/finalize/url operations for flexible file ingestion",
});

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
 * Register OCR output node type.
 *
 * This output type is for document text extraction nodes that use AI/OCR to
 * extract structured text from images or PDFs.
 */
flowTypeRegistry.register({
  id: OCR_OUTPUT_TYPE_ID,
  category: "output",
  schema: ocrOutputSchema,
  version: "1.0.0",
  description:
    "OCR output node that extracts structured text from documents using AI",
});

/**
 * Register image description output node type.
 *
 * This output type is for AI-powered image analysis nodes that generate
 * textual descriptions of image content.
 */
flowTypeRegistry.register({
  id: IMAGE_DESCRIPTION_OUTPUT_TYPE_ID,
  category: "output",
  schema: imageDescriptionOutputSchema,
  version: "1.0.0",
  description:
    "Image description output node that generates AI-powered descriptions of images",
});

// Export the registry for convenience
export { flowTypeRegistry } from "../type-registry";
