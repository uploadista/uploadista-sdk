/**
 * Flow execution argument schemas and types.
 *
 * Defines and validates the arguments passed when running a flow,
 * ensuring inputs are properly structured before execution begins.
 *
 * @module flow/types/run-args
 */

import { z } from "zod";

/**
 * Zod schema for validating flow run arguments.
 *
 * @property inputs - Record mapping input node IDs to their input data
 *
 * @example
 * ```typescript
 * const args = {
 *   inputs: {
 *     "input-node-1": { file: myFile, metadata: { ... } },
 *     "input-node-2": { file: anotherFile }
 *   }
 * };
 *
 * // Validate before running
 * const validated = runArgsSchema.parse(args);
 * ```
 */
export const runArgsSchema = z.object({
  inputs: z.record(z.string(), z.any()),
});

/**
 * Type representing validated flow run arguments.
 *
 * This type is inferred from the runArgsSchema and ensures type safety
 * when passing inputs to flow execution.
 */
export type RunArgs = z.infer<typeof runArgsSchema>;
