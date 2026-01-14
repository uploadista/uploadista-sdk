import { createFlow, createInputNode } from "@uploadista/core";
import {
  createConditionalNode,
  createMergeNode,
  createMultiplexNode,
  createZipNode,
} from "@uploadista/flow-utility-nodes/nodes";

/**
 * Conditional flow - routes files based on metadata conditions
 *
 * Nodes: input → conditional (sink, branches to two outputs)
 *
 * Configuration:
 * - Condition: file size > 1MB
 * - The conditional node acts as a sink with two branches based on the condition
 *
 * Use case: Route files based on properties like size, type, or custom metadata.
 * Useful for creating different processing pipelines based on file characteristics.
 * The conditional node is a sink (no further processing), so files are automatically
 * persisted to target storage based on which branch they take.
 *
 * @example
 * ```ts
 * import { conditionalFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(conditionalFlow, file);
 * // Large files and small files are both persisted
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
  },
  edges: [{ source: "input", target: "conditional" }],
});

/**
 * Merge flow - combines multiple input files into a single processing stream
 *
 * Nodes: multiple inputs → merge (sink)
 *
 * Use case: Accept multiple file uploads and process them together,
 * useful for batch operations or multi-file uploads. The merge node is a sink
 * (no outgoing edges), so the merged result is automatically persisted to
 * target storage.
 *
 * @example
 * ```ts
 * import { mergeFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(mergeFlow, [file1, file2, file3]);
 * // All files processed through merge and persisted
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
  },
  edges: [
    { source: "input-1", target: "merge" },
    { source: "input-2", target: "merge" },
    { source: "input-3", target: "merge" },
  ],
});

/**
 * Multiplex flow - splits a single input into parallel processing paths
 *
 * Nodes: input → multiplex (sink with 3 outputs)
 *
 * Use case: Create multiple versions of the same file with different processing,
 * such as generating thumbnails, web versions, and originals simultaneously. The
 * multiplex node is a sink (no outgoing edges), so all multiplexed outputs are
 * automatically persisted to target storage.
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
  },
  edges: [{ source: "input", target: "multiplex" }],
});

/**
 * Zip flow - archives multiple files into a single compressed file
 *
 * Nodes: multiple inputs → zip (sink)
 *
 * Configuration:
 * - Format: ZIP archive
 * - Compression: standard deflate
 *
 * Use case: Bundle multiple uploads into a single downloadable archive,
 * useful for batch downloads or packaging related files together. The zip
 * node is a sink (no outgoing edges), so the archive is automatically persisted
 * to target storage.
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
  },
  edges: [
    { source: "input-1", target: "zip" },
    { source: "input-2", target: "zip" },
    { source: "input-3", target: "zip" },
  ],
});
