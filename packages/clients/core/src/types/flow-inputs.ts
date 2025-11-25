/**
 * Type definitions for flexible flow input specifications.
 *
 * This module defines types for passing input data to flows with multiple input nodes.
 * The FlowInputs type maps node IDs to their respective input data, enabling support
 * for flows with single or multiple input points.
 *
 * @module types/flow-inputs
 *
 * @example
 * ```typescript
 * import type { FlowInputs } from "@uploadista/client-core";
 *
 * // Single input flow
 * const inputs: FlowInputs = {
 *   "file-input": {
 *     operation: "url",
 *     url: "https://example.com/image.jpg"
 *   }
 * };
 *
 * // Multi-input flow
 * const multiInputs: FlowInputs = {
 *   "file-input": {
 *     operation: "init",
 *     storageId: "s3",
 *     metadata: { originalName: "image.jpg" }
 *   },
 *   "metadata-input": {
 *     title: "My Image",
 *     tags: ["photo", "landscape"]
 *   }
 * };
 * ```
 */

/**
 * Flow input specification mapping node IDs to their input data.
 *
 * This type represents a map of input node IDs to their respective input data.
 * Each key is a node ID, and each value is the data to pass to that node.
 * The data structure depends on the node's registered input type.
 *
 * @remarks
 * Input data is validated against each node's registered type schema before
 * flow execution begins. Invalid data will result in validation errors.
 *
 * @example
 * ```typescript
 * // For streaming input node (init operation)
 * const fileUploadInputs: FlowInputs = {
 *   "input-node-1": {
 *     operation: "init",
 *     storageId: "my-storage",
 *     metadata: {
 *       originalName: "photo.jpg",
 *       mimeType: "image/jpeg",
 *       size: 1024000
 *     }
 *   }
 * };
 *
 * // For streaming input node (URL operation)
 * const urlInputs: FlowInputs = {
 *   "input-node-1": {
 *     operation: "url",
 *     url: "https://example.com/photo.jpg",
 *     storageId: "my-storage",
 *     metadata: {
 *       source: "external"
 *     }
 *   }
 * };
 * ```
 */
export type FlowInputs = Record<string, unknown>;

/**
 * Helper type for single-input flows.
 *
 * Many flows have exactly one input node. This helper type makes it easier
 * to work with single-input scenarios without needing to know the node ID upfront.
 *
 * @example
 * ```typescript
 * const singleInput: SingleFlowInput = {
 *   operation: "url",
 *   url: "https://example.com/image.jpg"
 * };
 *
 * // The client can auto-discover the input node ID and convert this to FlowInputs
 * ```
 */
export type SingleFlowInput = unknown;

/**
 * Result of input node discovery.
 *
 * Contains information about discovered input nodes in a flow, including
 * their IDs, types, and whether the flow has a single or multiple inputs.
 *
 * @property inputNodes - Array of input node information
 * @property single - True if flow has exactly one input node
 */
export interface InputNodeDiscovery {
  inputNodes: Array<{
    id: string;
    type: string;
    name?: string;
  }>;
  single: boolean;
}
