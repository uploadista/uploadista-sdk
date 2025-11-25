import {
  createFlow,
  createFlowNode,
  createInputNode,
  createTypeGuard,
  filterOutputsByType,
  getSingleOutputByType,
  isStorageOutput,
  NodeType,
  outputTypeRegistry,
  type TypedOutput,
  uploadFileSchema,
} from "@uploadista/core";
import { Effect } from "effect";
import { z } from "zod";

/**
 * Simple typed flow - demonstrates basic type usage with built-in types
 *
 * Nodes: input (sink)
 *
 * This flow uses the simplest architecture where the input node acts as a sink.
 * The file is automatically persisted to target storage.

 *
 * Use case: Basic file upload with type-safe result access.
 *
 * @example
 * ```ts
 * import { simpleTypedFlow } from '@uploadista/example-flows';
 * import { isStorageOutput } from '@uploadista/core';
 *
 * const result = await executeFlow(simpleTypedFlow, file);
 *
 * // Type-safe access to outputs
 * for (const output of result.outputs) {
 *   if (isStorageOutput(output)) {
 *     console.log('File URL:', output.data.url);
 *   }
 * }
 * ```
 */
export const simpleTypedFlow = createFlow({
  flowId: "simple-typed-flow",
  name: "Simple Typed Flow",
  nodes: {
    input: createInputNode("input"),
  },
  edges: [],
});

/**
 * Custom Type Registration Example
 *
 * This section demonstrates how to register custom types for domain-specific nodes.
 */

// 1. Define your custom output schema
const thumbnailSchema = z.object({
  url: z.string().url(),
  width: z.number().positive(),
  height: z.number().positive(),
  format: z.enum(["jpeg", "png", "webp"]),
  originalId: z.string(),
});

export type ThumbnailOutput = z.infer<typeof thumbnailSchema>;

// 2. Register the custom type (do this once at app startup)
export const THUMBNAIL_OUTPUT_TYPE_ID = "thumbnail-output-v1";

outputTypeRegistry.register({
  id: THUMBNAIL_OUTPUT_TYPE_ID,
  schema: thumbnailSchema,
  version: "1.0.0",
  description: "Generated thumbnail with dimensions and format",
});

// 3. Create a type guard for the custom type
export const isThumbnailOutput = createTypeGuard<ThumbnailOutput>(
  THUMBNAIL_OUTPUT_TYPE_ID,
);

// 4. Create a custom node using the registered type
export const createThumbnailNode = (
  id: string,
  options: { width: number; height: number; format: "jpeg" | "png" | "webp" },
) =>
  createFlowNode({
    id,
    name: "Generate Thumbnail",
    description: "Creates a thumbnail with specified dimensions",
    type: NodeType.process,
    inputSchema: uploadFileSchema,
    outputSchema: thumbnailSchema,
    outputTypeId: THUMBNAIL_OUTPUT_TYPE_ID,
    run: ({ data }) =>
      Effect.succeed({
        type: "complete" as const,
        data: {
          url: `https://cdn.example.com/thumbnails/${data.id}_${options.width}x${options.height}.${options.format}`,
          width: options.width,
          height: options.height,
          format: options.format,
          originalId: data.id,
        },
      }),
  });

/**
 * Multi-output flow - demonstrates flow with multiple typed outputs
 *
 * Nodes: input → thumbnail (200x200 sink)
 *
 * This flow produces a thumbnail output:
 * - thumbnail-output-v1 (200x200 thumbnail)
 *
 * Use case: Upload an image and generate a thumbnail. The thumbnail node is
 * a sink (no outgoing edges), so the thumbnail is automatically persisted to
 * target storage.
 *
 * @example
 * ```ts
 * import { multiOutputFlow, isThumbnailOutput } from '@uploadista/example-flows';
 * import { filterOutputsByType } from '@uploadista/core';
 *
 * const result = await executeFlow(multiOutputFlow, imageFile);
 *
 * // Access specific output types
 * const thumbnails = filterOutputsByType(result.outputs, isThumbnailOutput);
 *
 * console.log('Thumbnail:', thumbnails[0]?.data.url);
 * ```
 */
export const multiOutputFlow = createFlow({
  flowId: "multi-output-flow",
  name: "Multi-Output Flow",
  nodes: {
    input: createInputNode("input"),
    thumbnail: createThumbnailNode("thumbnail", {
      width: 200,
      height: 200,
      format: "webp",
    }),
  },
  edges: [{ source: "input", target: "thumbnail" }],
});

/**
 * Custom Description Type Example
 */

const descriptionSchema = z.object({
  description: z.string().min(1),
  confidence: z.number().min(0).max(1),
  tags: z.array(z.string()),
  language: z.string().length(2).default("en"),
});

export type DescriptionOutput = z.infer<typeof descriptionSchema>;

export const DESCRIPTION_OUTPUT_TYPE_ID = "description-output-v1";

outputTypeRegistry.register({
  id: DESCRIPTION_OUTPUT_TYPE_ID,
  schema: descriptionSchema,
  version: "1.0.0",
  description: "AI-generated image description with confidence and tags",
});

export const isDescriptionOutput = createTypeGuard<DescriptionOutput>(
  DESCRIPTION_OUTPUT_TYPE_ID,
);

export const createDescribeImageNode = (id: string) =>
  createFlowNode({
    id,
    name: "Describe Image",
    description: "Generate AI description of image content",
    type: NodeType.process,
    inputSchema: uploadFileSchema,
    outputSchema: descriptionSchema,
    outputTypeId: DESCRIPTION_OUTPUT_TYPE_ID,
    run: ({ data }) =>
      Effect.succeed({
        type: "complete" as const,
        data: {
          description: `An image file with ID ${data.id}`,
          confidence: 0.95,
          tags: ["image", "upload"],
          language: "en",
        },
      }),
  });

/**
 * Complex multi-output flow with multiple custom types
 *
 * Nodes: input → thumbnail (sink) + description (sink)
 *
 * This flow produces two different output types:
 * 1. thumbnail-output-v1 (thumbnail)
 * 2. description-output-v1 (AI description)
 *
 * Use case: Comprehensive image processing pipeline with thumbnail generation
 * and AI-powered description. Both nodes are sinks (no outgoing edges), so the
 * outputs are automatically persisted to target storage.
 *
 * @example
 * ```ts
 * import { complexTypedFlow } from '@uploadista/example-flows';
 * import { hasOutputOfType } from '@uploadista/core';
 * import { isThumbnailOutput, isDescriptionOutput } from '@uploadista/example-flows';
 *
 * const result = await executeFlow(complexTypedFlow, imageFile);
 *
 * // Check which outputs are present
 * if (hasOutputOfType(result.outputs, isThumbnailOutput)) {
 *   console.log('Thumbnail generated');
 * }
 *
 * if (hasOutputOfType(result.outputs, isDescriptionOutput)) {
 *   console.log('Description created');
 * }
 *
 * // Process each output by type
 * for (const output of result.outputs) {
 *   if (isThumbnailOutput(output)) {
 *     console.log('Thumbnail:', `${output.data.width}x${output.data.height}`);
 *   } else if (isDescriptionOutput(output)) {
 *     console.log('Description:', output.data.description);
 *     console.log('Confidence:', output.data.confidence);
 *     console.log('Tags:', output.data.tags.join(', '));
 *   }
 * }
 * ```
 */
export const complexTypedFlow = createFlow({
  flowId: "complex-typed-flow",
  name: "Complex Typed Flow",
  nodes: {
    input: createInputNode("input"),
    thumbnail: createThumbnailNode("thumbnail", {
      width: 200,
      height: 200,
      format: "webp",
    }),
    description: createDescribeImageNode("description"),
  },
  edges: [
    { source: "input", target: "thumbnail" },
    { source: "input", target: "description" },
  ],
});

/**
 * Type Guard Usage Examples
 *
 * Demonstrates various helper functions for working with typed outputs.
 */

/**
 * Example: Filter outputs by type
 *
 * @example
 * ```ts
 * const thumbnails = filterOutputsByType(outputs, isThumbnailOutput);
 * thumbnails.forEach(thumb => {
 *   console.log(`${thumb.data.width}x${thumb.data.height}`);
 * });
 * ```
 */
export function exampleFilterByType(outputs: TypedOutput[]): void {
  const thumbnails = filterOutputsByType(outputs, isThumbnailOutput);
  console.log(`Found ${thumbnails.length} thumbnails`);
}

/**
 * Example: Get single output (throws if 0 or multiple)
 *
 * @example
 * ```ts
 * try {
 *   const storage = getSingleOutputByType(outputs, isStorageOutput);
 *   console.log('URL:', storage.data.url);
 * } catch (error) {
 *   if (error.code === 'OUTPUT_NOT_FOUND') {
 *     console.error('No storage output found');
 *   } else if (error.code === 'MULTIPLE_OUTPUTS_FOUND') {
 *     console.error('Multiple storage outputs, expected one');
 *   }
 * }
 * ```
 */
export function exampleGetSingleOutput(outputs: TypedOutput[]): void {
  Effect.gen(function* () {
    try {
      const storage = yield* getSingleOutputByType(outputs, isStorageOutput);
      console.log("Storage URL:", storage.data.url);
    } catch (error) {
      console.error("Failed to get storage output:", error);
    }
  });
}

/**
 * Example: Type-safe output processing with switch statement
 *
 * @example
 * ```ts
 * for (const output of outputs) {
 *   switch (output.nodeType) {
 *     case 'storage-output-v1':
 *       console.log('Storage:', output.data.url);
 *       break;
 *     case 'thumbnail-output-v1':
 *       console.log('Thumbnail:', output.data.url);
 *       break;
 *     case 'description-output-v1':
 *       console.log('Description:', output.data.description);
 *       break;
 *     default:
 *       console.log('Unknown output type:', output.nodeType);
 *   }
 * }
 * ```
 */
export function exampleSwitchByType(outputs: TypedOutput[]): void {
  for (const output of outputs) {
    switch (output.nodeType) {
      case "storage-output-v1":
        if (
          typeof output.data === "object" &&
          output.data !== null &&
          "url" in output.data
        ) {
          console.log("Storage:", output.data.url);
        }
        break;
      case THUMBNAIL_OUTPUT_TYPE_ID:
        console.log(
          "Thumbnail:",
          `${(output.data as ThumbnailOutput).width}x${(output.data as ThumbnailOutput).height}`,
        );
        break;
      case DESCRIPTION_OUTPUT_TYPE_ID:
        console.log(
          "Description:",
          (output.data as DescriptionOutput).description,
        );
        break;
      default:
        console.log("Unknown type:", output.nodeType);
    }
  }
}

/**
 * Example: Progressive enhancement (supports both typed and untyped flows)
 *
 * @example
 * ```ts
 * function processOutputs(outputs: TypedOutput[]): void {
 *   const typedOutputs = outputs.filter(o => o.nodeType);
 *   const untypedOutputs = outputs.filter(o => !o.nodeType);
 *
 *   if (typedOutputs.length > 0) {
 *     console.log('Processing typed outputs with type guards');
 *     typedOutputs.forEach(output => {
 *       if (isStorageOutput(output)) {
 *         console.log('Storage:', output.data.url);
 *       }
 *     });
 *   }
 *
 *   if (untypedOutputs.length > 0) {
 *     console.log('Fallback for untyped outputs');
 *     untypedOutputs.forEach(output => {
 *       console.log('Untyped data:', output.data);
 *     });
 *   }
 * }
 * ```
 */
export function exampleProgressiveEnhancement(outputs: TypedOutput[]): void {
  const typedOutputs = outputs.filter((o) => o.nodeType);
  const untypedOutputs = outputs.filter((o) => !o.nodeType);

  console.log(
    `Typed: ${typedOutputs.length}, Untyped: ${untypedOutputs.length}`,
  );

  if (typedOutputs.length > 0) {
    console.log("Processing with type guards...");
    typedOutputs.forEach((output) => {
      if (isStorageOutput(output)) {
        console.log("Storage:", output.data.url);
      }
    });
  }

  if (untypedOutputs.length > 0) {
    console.log("Fallback for untyped outputs...");
  }
}
