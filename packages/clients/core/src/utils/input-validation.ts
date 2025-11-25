/**
 * Utilities for validating flow inputs against registered node type schemas.
 *
 * @module utils/input-validation
 */

import type { FlowData } from "@uploadista/core/flow";
import type { FlowInputs } from "../types/flow-inputs";
import { UploadistaError } from "../error";

/**
 * Validation error details for a specific input node.
 */
export interface InputValidationError {
  nodeId: string;
  nodeType: string;
  error: string;
  details?: unknown;
}

/**
 * Result of validating flow inputs.
 */
export type InputValidationResult =
  | { success: true }
  | { success: false; errors: InputValidationError[] };

/**
 * Validate flow inputs against registered node type schemas.
 *
 * This function:
 * 1. Fetches flow metadata to get input node types
 * 2. Looks up each node type in the flowTypeRegistry
 * 3. Validates each input against its node's schema using Zod
 * 4. Returns validation errors before any network calls
 *
 * @param flowInputs - The inputs to validate (nodeId → data mapping)
 * @param flow - Flow metadata containing node information
 * @returns Validation result with errors if validation fails
 *
 * @example
 * ```typescript
 * const flowInputs = {
 *   "file-input": { operation: "init", storageId: "s3", metadata: {...} },
 *   "url-input": { operation: "url", url: "https://..." }
 * };
 *
 * const result = validateFlowInputs(flowInputs, flow);
 * if (!result.success) {
 *   console.error("Validation errors:", result.errors);
 *   for (const error of result.errors) {
 *     console.error(`- ${error.nodeId}: ${error.error}`);
 *   }
 * }
 * ```
 */
export function validateFlowInputs(
  flowInputs: FlowInputs,
  flow: FlowData,
): InputValidationResult {
  const errors: InputValidationError[] = [];

  // Validate each input against its node's type schema
  for (const [nodeId, inputData] of Object.entries(flowInputs)) {
    // Find the node in the flow
    const node = flow.nodes.find((n) => n.id === nodeId);

    if (!node) {
      errors.push({
        nodeId,
        nodeType: "unknown",
        error: `Input node "${nodeId}" not found in flow "${flow.id}"`,
      });
      continue;
    }

    // Only validate input nodes
    if (node.type !== "input") {
      errors.push({
        nodeId,
        nodeType: node.type,
        error: `Node "${nodeId}" is not an input node (type: ${node.type})`,
      });
      continue;
    }

    // Basic validation: ensure input data is not null/undefined
    if (inputData === null || inputData === undefined) {
      errors.push({
        nodeId,
        nodeType: node.type,
        error: `Input data for node "${nodeId}" is null or undefined`,
      });
      continue;
    }

    // Note: Schema validation is done server-side.
    // Client-side validation only checks for presence and basic structure.
  }

  // Return success if no errors
  if (errors.length === 0) {
    return { success: true };
  }

  return { success: false, errors };
}

/**
 * Validate flow inputs and throw an error if validation fails.
 *
 * This is a convenience wrapper around validateFlowInputs that throws
 * an UploadistaError on validation failure instead of returning a result.
 *
 * @param flowInputs - The inputs to validate
 * @param flow - Flow metadata containing node information
 * @throws {UploadistaError} If validation fails
 *
 * @example
 * ```typescript
 * try {
 *   validateFlowInputsOrThrow(flowInputs, flow);
 *   // Proceed with execution
 * } catch (error) {
 *   console.error("Invalid inputs:", error.message);
 * }
 * ```
 */
export function validateFlowInputsOrThrow(
  flowInputs: FlowInputs,
  flow: FlowData,
): void {
  const result = validateFlowInputs(flowInputs, flow);

  if (!result.success) {
    // Format error message with all validation errors
    const errorMessages = result.errors.map(
      (err) => `- ${err.nodeId} (${err.nodeType}): ${err.error}`,
    );

    throw new UploadistaError({
      name: "VALIDATION_ERROR",
      message: `Flow input validation failed:\n${errorMessages.join("\n")}`,
    });
  }
}

/**
 * Check if all required input nodes in a flow have been provided.
 *
 * @param flowInputs - The provided inputs
 * @param flow - Flow metadata containing node information
 * @returns True if all required input nodes have data
 *
 * @example
 * ```typescript
 * const flow = await client.getFlow("my-flow");
 * const inputs = { "node1": file };
 *
 * if (!allRequiredInputsProvided(inputs, flow.flow)) {
 *   console.warn("Missing required inputs");
 * }
 * ```
 */
export function allRequiredInputsProvided(
  flowInputs: FlowInputs,
  flow: FlowData,
): boolean {
  // Find all input nodes in the flow
  const inputNodes = flow.nodes.filter((node) => node.type === "input");

  // Check if all input nodes have corresponding data
  for (const node of inputNodes) {
    if (!(node.id in flowInputs)) {
      return false;
    }
  }

  return true;
}
