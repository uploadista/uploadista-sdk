import {
  createFlow,
  createInputNode,
  createStorageNode,
} from "@uploadista/core";
import {
  createConditionalNode,
  createMergeNode,
  createMultiplexNode,
  createZipNode,
} from "@uploadista/flow-utility-nodes/nodes";

/**
 * Conditional flow - routes files based on metadata conditions
 *
 * Nodes: input → conditional → branching outputs
 *
 * Configuration:
 * - Condition: file size > 1MB
 * - True branch: stores to "large-files" output
 * - False branch: stores to "small-files" output
 *
 * Use case: Route files based on properties like size, type, or custom metadata.
 * Useful for creating different processing pipelines based on file characteristics.
 *
 * @example
 * ```ts
 * import { conditionalFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(conditionalFlow, file);
 * // Large files go to one output, small files to another
 * ```
 */
export const conditionalFlow = createFlow({
  flowId: "conditional-flow",
  name: "Conditional Flow",
  nodes: {
    input: createInputNode("input"),
    conditional: createConditionalNode("conditional", {
      field: "size",
      operator: "greaterThan",
      value: 1000000, // 1MB
    }),
    "output-large": createStorageNode("output-large"),
    "output-small": createStorageNode("output-small"),
  },
  edges: [
    { source: "input", target: "conditional" },
    { source: "conditional", target: "output-large" },
    { source: "conditional", target: "output-small" },
  ],
});

/**
 * Merge flow - combines multiple input files into a single processing stream
 *
 * Nodes: multiple inputs → merge → output
 *
 * Use case: Accept multiple file uploads and process them together,
 * useful for batch operations or multi-file uploads.
 *
 * @example
 * ```ts
 * import { mergeFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(mergeFlow, [file1, file2, file3]);
 * // All files processed through single output
 * ```
 */
export const mergeFlow = createFlow({
  flowId: "merge-flow",
  name: "Merge Flow",
  nodes: {
    "input-1": createInputNode("input-1"),
    "input-2": createInputNode("input-2"),
    "input-3": createInputNode("input-3"),
    merge: createMergeNode("merge", { strategy: "concat", inputCount: 3 }),
    output: createStorageNode("output"),
  },
  edges: [
    { source: "input-1", target: "merge" },
    { source: "input-2", target: "merge" },
    { source: "input-3", target: "merge" },
    { source: "merge", target: "output" },
  ],
});

/**
 * Multiplex flow - splits a single input into parallel processing paths
 *
 * Nodes: input → multiplex → multiple parallel outputs
 *
 * Use case: Create multiple versions of the same file with different processing,
 * such as generating thumbnails, web versions, and originals simultaneously.
 *
 * @example
 * ```ts
 * import { multiplexFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(multiplexFlow, imageFile);
 * // Single image processed into multiple outputs
 * ```
 */
export const multiplexFlow = createFlow({
  flowId: "multiplex-flow",
  name: "Multiplex Flow",
  nodes: {
    input: createInputNode("input"),
    multiplex: createMultiplexNode("multiplex", {
      outputCount: 3,
      strategy: "copy",
    }),
    "output-1": createStorageNode("output-1"),
    "output-2": createStorageNode("output-2"),
    "output-3": createStorageNode("output-3"),
  },
  edges: [
    { source: "input", target: "multiplex" },
    { source: "multiplex", target: "output-1" },
    { source: "multiplex", target: "output-2" },
    { source: "multiplex", target: "output-3" },
  ],
});

/**
 * Zip flow - archives multiple files into a single compressed file
 *
 * Nodes: multiple inputs → zip → output
 *
 * Configuration:
 * - Format: ZIP archive
 * - Compression: standard deflate
 *
 * Use case: Bundle multiple uploads into a single downloadable archive,
 * useful for batch downloads or packaging related files together.
 *
 * @example
 * ```ts
 * import { zipFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(zipFlow, [doc1, doc2, doc3]);
 * // result.file = single ZIP archive containing all files
 * ```
 */
export const zipFlow = createFlow({
  flowId: "zip-flow",
  name: "Zip Flow",
  nodes: {
    "input-1": createInputNode("input-1"),
    "input-2": createInputNode("input-2"),
    "input-3": createInputNode("input-3"),
    zip: createZipNode("zip", {
      zipName: "archive.zip",
      includeMetadata: false,
      inputCount: 3,
    }),
    output: createStorageNode("output"),
  },
  edges: [
    { source: "input-1", target: "zip" },
    { source: "input-2", target: "zip" },
    { source: "input-3", target: "zip" },
    { source: "zip", target: "output" },
  ],
});
