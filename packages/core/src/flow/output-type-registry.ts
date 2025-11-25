/**
 * Output type registry for flow result nodes.
 *
 * This module provides a registry for output node type definitions. Output types
 * describe the data shapes that flow through the system and appear in results
 * (e.g., UploadFile for storage outputs, OcrOutput for OCR results).
 *
 * Output types are distinct from input types - they describe the data that nodes
 * produce, enabling type-safe result consumption in clients.
 *
 * @module flow/output-type-registry
 * @see {@link inputTypeRegistry} for input types
 *
 * @example
 * ```typescript
 * import { outputTypeRegistry } from "@uploadista/core/flow";
 * import { z } from "zod";
 *
 * // Register a custom output type
 * outputTypeRegistry.register({
 *   id: "thumbnail-output-v1",
 *   schema: z.object({
 *     url: z.string(),
 *     width: z.number(),
 *     height: z.number(),
 *   }),
 *   version: "1.0.0",
 *   description: "Thumbnail generation output",
 * });
 * ```
 */

import type { z } from "zod";
import { UploadistaError } from "../errors";

/**
 * Defines a registered output type with its schema and metadata.
 *
 * Output type definitions describe the data shapes produced by nodes. This enables
 * type-safe result consumption where clients can narrow types based on the
 * `nodeType` field in results.
 *
 * @template TSchema - The Zod schema type for this output's data
 *
 * @property id - Unique identifier (e.g., "storage-output-v1", "ocr-output-v1")
 * @property schema - Zod schema for validating output data
 * @property version - Semantic version (e.g., "1.0.0") for tracking type evolution
 * @property description - Human-readable explanation of what this output type contains
 */
export interface OutputTypeDefinition<TSchema = unknown> {
  id: string;
  schema: z.ZodSchema<TSchema>;
  version: string;
  description: string;
}

/**
 * Result type for output validation operations.
 *
 * @template T - The expected type on successful validation
 */
export type OutputValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: UploadistaError };

/**
 * Registry for output node type definitions.
 *
 * The OutputTypeRegistry maintains a global registry of output types with their schemas
 * and metadata. Output types describe the data shapes that flow through the system
 * and appear in results.
 *
 * @remarks
 * - Use the exported `outputTypeRegistry` singleton instance
 * - Types cannot be unregistered or modified after registration
 * - Duplicate type IDs are rejected
 *
 * @example
 * ```typescript
 * // Register a new output type
 * outputTypeRegistry.register({
 *   id: "metadata-output-v1",
 *   schema: metadataSchema,
 *   version: "1.0.0",
 *   description: "File metadata extraction output",
 * });
 *
 * // Validate result data
 * const result = outputTypeRegistry.validate("storage-output-v1", data);
 * if (result.success) {
 *   console.log(result.data.url);
 * }
 * ```
 */
export class OutputTypeRegistry {
  private readonly types: Map<string, OutputTypeDefinition<unknown>>;

  constructor() {
    this.types = new Map();
  }

  /**
   * Register a new output type in the registry.
   *
   * @template T - The TypeScript type inferred from the Zod schema
   * @param definition - The complete type definition including schema and metadata
   * @throws {UploadistaError} If a type with the same ID is already registered
   */
  register<T>(definition: OutputTypeDefinition<T>): void {
    if (this.types.has(definition.id)) {
      throw UploadistaError.fromCode("VALIDATION_ERROR", {
        body: `Output type "${definition.id}" is already registered. Types cannot be modified or re-registered.`,
        details: { typeId: definition.id },
      });
    }

    this.types.set(definition.id, definition as OutputTypeDefinition<unknown>);
  }

  /**
   * Retrieve a registered type definition by its ID.
   *
   * @param id - The unique type identifier (e.g., "storage-output-v1")
   * @returns The type definition if found, undefined otherwise
   */
  get(id: string): OutputTypeDefinition<unknown> | undefined {
    return this.types.get(id);
  }

  /**
   * List all registered output types.
   *
   * @returns Array of all output type definitions
   */
  list(): OutputTypeDefinition<unknown>[] {
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
  validate<T>(typeId: string, data: unknown): OutputValidationResult<T> {
    const typeDef = this.types.get(typeId);

    if (!typeDef) {
      return {
        success: false,
        error: UploadistaError.fromCode("VALIDATION_ERROR", {
          body: `Output type "${typeId}" is not registered`,
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
          body: `Data validation failed for output type "${typeId}"`,
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
 * Global singleton instance of the output type registry.
 *
 * Use this instance to register and access output node type definitions.
 * Output types describe the data shapes produced by nodes and used in results.
 *
 * @example
 * ```typescript
 * import { outputTypeRegistry } from "@uploadista/core/flow";
 *
 * // Register a type
 * outputTypeRegistry.register({
 *   id: "my-output-v1",
 *   schema: myOutputSchema,
 *   version: "1.0.0",
 *   description: "My custom output type",
 * });
 *
 * // Validate result data
 * const result = outputTypeRegistry.validate("my-output-v1", data);
 * ```
 */
export const outputTypeRegistry = new OutputTypeRegistry();

/**
 * Validates flow output data against a registered output type.
 *
 * @param typeId - The registered type ID (e.g., "storage-output-v1")
 * @param data - The output data to validate
 * @returns A validation result with either the typed data or an error
 */
export function validateFlowOutput<T = unknown>(
  typeId: string,
  data: unknown,
): OutputValidationResult<T> {
  return outputTypeRegistry.validate<T>(typeId, data);
}
