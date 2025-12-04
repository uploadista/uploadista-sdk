/**
 * Input type registry for flow entry point nodes.
 *
 * This module provides a registry for input node type definitions. Input types
 * describe how data enters the flow system from external sources (e.g., streaming
 * uploads, URL fetches, webhook triggers).
 *
 * Input types are distinct from output types - they describe the external interface
 * that clients use to interact with input nodes, not the data shape that flows
 * through the system.
 *
 * @module flow/input-type-registry
 * @see {@link outputTypeRegistry} for output types
 *
 * @example
 * ```typescript
 * import { inputTypeRegistry } from "@uploadista/core/flow";
 * import { z } from "zod";
 *
 * // Register a custom input type
 * inputTypeRegistry.register({
 *   id: "webhook-input-v1",
 *   schema: z.object({
 *     payload: z.unknown(),
 *     headers: z.record(z.string()),
 *   }),
 *   version: "1.0.0",
 *   description: "Webhook-triggered file input",
 * });
 * ```
 */

import type { z } from "zod";
import { UploadistaError } from "../errors";

/**
 * Defines a registered input type with its schema and metadata.
 *
 * Input type definitions describe how external clients interact with input nodes.
 * Unlike output types, input types define the external interface (e.g., init/finalize
 * operations for streaming uploads).
 *
 * @template TSchema - The Zod schema type for this input's data
 *
 * @property id - Unique identifier (e.g., "streaming-input-v1")
 * @property schema - Zod schema for validating input data from clients
 * @property version - Semantic version (e.g., "1.0.0") for tracking type evolution
 * @property description - Human-readable explanation of what this input type does
 */
export interface InputTypeDefinition<TSchema = unknown> {
  id: string;
  schema: z.ZodSchema<TSchema>;
  version: string;
  description: string;
}

/**
 * Result type for input validation operations.
 *
 * @template T - The expected type on successful validation
 */
export type InputValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: UploadistaError };

/**
 * Registry for input node type definitions.
 *
 * The InputTypeRegistry maintains a global registry of input types with their schemas
 * and metadata. Input types describe how data enters the flow from external sources.
 *
 * @remarks
 * - Use the exported `inputTypeRegistry` singleton instance
 * - Types cannot be unregistered or modified after registration
 * - Duplicate type IDs are rejected
 *
 * @example
 * ```typescript
 * // Register a new input type
 * inputTypeRegistry.register({
 *   id: "form-input-v1",
 *   schema: formInputSchema,
 *   version: "1.0.0",
 *   description: "Form-based file input",
 * });
 *
 * // Check if type exists
 * if (inputTypeRegistry.has("streaming-input-v1")) {
 *   const def = inputTypeRegistry.get("streaming-input-v1");
 * }
 * ```
 */
export class InputTypeRegistry {
  private readonly types: Map<string, InputTypeDefinition<unknown>>;

  constructor() {
    this.types = new Map();
  }

  /**
   * Register a new input type in the registry.
   *
   * @template T - The TypeScript type inferred from the Zod schema
   * @param definition - The complete type definition including schema and metadata
   * @throws {UploadistaError} If a type with the same ID is already registered
   */
  register<T>(definition: InputTypeDefinition<T>): void {
    if (this.types.has(definition.id)) {
      throw UploadistaError.fromCode("VALIDATION_ERROR", {
        body: `Input type "${definition.id}" is already registered. Types cannot be modified or re-registered.`,
        details: { typeId: definition.id },
      });
    }

    this.types.set(definition.id, definition as InputTypeDefinition<unknown>);
  }

  /**
   * Retrieve a registered type definition by its ID.
   *
   * @param id - The unique type identifier (e.g., "streaming-input-v1")
   * @returns The type definition if found, undefined otherwise
   */
  get(id: string): InputTypeDefinition<unknown> | undefined {
    return this.types.get(id);
  }

  /**
   * List all registered input types.
   *
   * @returns Array of all input type definitions
   */
  list(): InputTypeDefinition<unknown>[] {
    return Array.from(this.types.values());
  }

  /**
   * Validate data against a registered type's schema.
   *
   * @template T - The expected TypeScript type after validation
   * @param typeId - The ID of the registered type to validate against
   * @param data - The data to validate
   * @returns A result object with either the validated data or an error
   */
  validate<T>(typeId: string, data: unknown): InputValidationResult<T> {
    const typeDef = this.types.get(typeId);

    if (!typeDef) {
      return {
        success: false,
        error: UploadistaError.fromCode("VALIDATION_ERROR", {
          body: `Input type "${typeId}" is not registered`,
          details: { typeId },
        }),
      };
    }

    try {
      const parsed = typeDef.schema.parse(data);
      return { success: true, data: parsed as T };
    } catch (error) {
      return {
        success: false,
        error: UploadistaError.fromCode("VALIDATION_ERROR", {
          body: `Data validation failed for input type "${typeId}"`,
          cause: error,
          details: { typeId, validationErrors: error },
        }),
      };
    }
  }

  /**
   * Check if a type is registered.
   *
   * @param id - The unique type identifier to check
   * @returns True if the type is registered, false otherwise
   */
  has(id: string): boolean {
    return this.types.has(id);
  }

  /**
   * Get the total number of registered types.
   *
   * @returns The count of registered types
   */
  size(): number {
    return this.types.size;
  }
}

/**
 * Global singleton instance of the input type registry.
 *
 * Use this instance to register and access input node type definitions.
 * Input types describe how data enters the flow from external sources.
 *
 * @example
 * ```typescript
 * import { inputTypeRegistry } from "@uploadista/core/flow";
 *
 * // Register a type
 * inputTypeRegistry.register({
 *   id: "my-input-v1",
 *   schema: myInputSchema,
 *   version: "1.0.0",
 *   description: "My custom input type",
 * });
 *
 * // Validate data
 * const result = inputTypeRegistry.validate("my-input-v1", data);
 * ```
 */
export const inputTypeRegistry = new InputTypeRegistry();

/**
 * Validates flow input data against a registered input type.
 *
 * @param typeId - The registered type ID (e.g., "streaming-input-v1")
 * @param data - The input data to validate
 * @returns A validation result with either the typed data or an error
 */
export function validateFlowInput<T = unknown>(
  typeId: string,
  data: unknown,
): InputValidationResult<T> {
  return inputTypeRegistry.validate<T>(typeId, data);
}
