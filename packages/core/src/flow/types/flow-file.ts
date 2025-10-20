/**
 * Conditional execution rules for flow nodes.
 *
 * Conditions allow nodes to execute conditionally based on file properties or metadata.
 * They are evaluated before node execution and can skip nodes that don't match.
 *
 * @module flow/types/flow-file
 * @see {@link FlowNode} for how conditions are used in nodes
 *
 * @example
 * ```typescript
 * // Only process images larger than 1MB
 * const condition: FlowCondition = {
 *   field: "size",
 *   operator: "greaterThan",
 *   value: 1024 * 1024
 * };
 *
 * // Only process JPEG images
 * const jpegCondition: FlowCondition = {
 *   field: "mimeType",
 *   operator: "startsWith",
 *   value: "image/jpeg"
 * };
 * ```
 */

/**
 * Represents a conditional rule for node execution.
 *
 * @property field - The file property to check
 * @property operator - The comparison operator to apply
 * @property value - The value to compare against
 *
 * @remarks
 * - Fields can check file metadata (mimeType, size) or image properties (width, height)
 * - String operators (contains, startsWith) work with string values
 * - Numeric operators (greaterThan, lessThan) work with numeric values
 * - The extension field checks the file extension without the dot
 */
export type FlowCondition = {
  field: "mimeType" | "size" | "width" | "height" | "extension";
  operator:
    | "equals"
    | "notEquals"
    | "greaterThan"
    | "lessThan"
    | "contains"
    | "startsWith";
  value: string | number;
};
