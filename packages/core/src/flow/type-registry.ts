/**
 * Type registry system for flow input and output nodes.
 *
 * This module provides a centralized registry for node type definitions with schemas
 * and metadata. The registry enables type-safe flow result consumption in dynamic
 * client environments by allowing clients to safely cast flow results based on
 * registered node types.
 *
 * @module flow/type-registry
 * @see {@link FlowTypeRegistry} for the registry implementation
 * @see {@link NodeTypeDefinition} for type definition structure
 *
 * @example
 * ```typescript
 * // Register a custom output type
 * import { flowTypeRegistry } from "@uploadista/core/flow";
 * import { z } from "zod";
 *
 * const descriptionOutputSchema = z.object({
 *   description: z.string(),
 *   confidence: z.number(),
 * });
 *
 * flowTypeRegistry.register({
 *   id: "description-output-v1",
 *   category: "output",
 *   schema: descriptionOutputSchema,
 *   version: "1.0.0",
 *   description: "AI-powered image description output",
 * });
 *
 * // Later, validate data against the registered type
 * const result = flowTypeRegistry.validate("description-output-v1", data);
 * if (result.success) {
 *   console.log(result.data.description);
 * }
 * ```
 */

import type { z } from "zod";
import { UploadistaError } from "../errors";

/**
 * Node type category - determines where the node appears in the flow.
 *
 * - `input`: Nodes that receive data from external sources (e.g., file uploads)
 * - `output`: Nodes that produce final results (e.g., storage, webhooks, descriptions)
 */
export type NodeTypeCategory = "input" | "output";

/**
 * Defines a registered node type with its schema and metadata.
 *
 * Node type definitions are registered globally and used to validate and type-narrow
 * flow results at runtime. Each definition includes:
 * - A unique identifier with versioning
 * - A category (input or output)
 * - A Zod schema for runtime validation
 * - A semantic version for evolution
 * - A human-readable description
 *
 * @template TSchema - The Zod schema type for this node's data
 *
 * @property id - Unique identifier (e.g., "storage-output-v1", "webhook-output-v1")
 * @property category - Whether this is an input or output node type
 * @property schema - Zod schema for validating data produced by this node type
 * @property version - Semantic version (e.g., "1.0.0") for tracking type evolution
 * @property description - Human-readable explanation of what this node type does
 *
 * @example
 * ```typescript
 * const storageOutputDef: NodeTypeDefinition<z.infer<typeof uploadFileSchema>> = {
 *   id: "storage-output-v1",
 *   category: "output",
 *   schema: uploadFileSchema,
 *   version: "1.0.0",
 *   description: "Storage output node that saves files to configured storage backend",
 * };
 * ```
 */
export interface NodeTypeDefinition<TSchema = unknown> {
  id: string;
  category: NodeTypeCategory;
  schema: z.ZodSchema<TSchema>;
  version: string;
  description: string;
}

/**
 * Result type for validation operations.
 *
 * @template T - The expected type on successful validation
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: UploadistaError };

/**
 * Central registry for node type definitions.
 *
 * The FlowTypeRegistry maintains a global registry of node types with their schemas
 * and metadata. It provides methods for:
 * - Registering new node types
 * - Retrieving type definitions
 * - Listing types by category
 * - Validating data against registered schemas
 *
 * The registry is immutable after registration - types cannot be modified or removed
 * once registered to prevent runtime errors.
 *
 * @remarks
 * - This is a singleton - use the exported `flowTypeRegistry` instance
 * - Types cannot be unregistered or modified after registration
 * - Duplicate type IDs are rejected
 * - Version strings should follow semantic versioning
 *
 * @example
 * ```typescript
 * // Register a new type
 * flowTypeRegistry.register({
 *   id: "webhook-output-v1",
 *   category: "output",
 *   schema: webhookResponseSchema,
 *   version: "1.0.0",
 *   description: "HTTP webhook notification output",
 * });
 *
 * // Retrieve a type definition
 * const def = flowTypeRegistry.get("webhook-output-v1");
 * if (def) {
 *   console.log(def.description);
 * }
 *
 * // List all output types
 * const outputTypes = flowTypeRegistry.listByCategory("output");
 * console.log(outputTypes.map(t => t.id));
 *
 * // Validate data
 * const result = flowTypeRegistry.validate("webhook-output-v1", data);
 * if (result.success) {
 *   // data is now typed according to the schema
 *   processWebhookResponse(result.data);
 * }
 * ```
 */
export class FlowTypeRegistry {
  private readonly types: Map<string, NodeTypeDefinition<unknown>>;

  constructor() {
    this.types = new Map();
  }

  /**
   * Register a new node type in the registry.
   *
   * Once registered, a type cannot be modified or removed. Attempting to register
   * a type with a duplicate ID will throw an error.
   *
   * @template T - The TypeScript type inferred from the Zod schema
   * @param definition - The complete type definition including schema and metadata
   * @throws {UploadistaError} If a type with the same ID is already registered
   *
   * @example
   * ```typescript
   * import { z } from "zod";
   *
   * flowTypeRegistry.register({
   *   id: "description-output-v1",
   *   category: "output",
   *   schema: z.object({
   *     description: z.string(),
   *     confidence: z.number().min(0).max(1),
   *     tags: z.array(z.string()).optional(),
   *   }),
   *   version: "1.0.0",
   *   description: "AI-generated image description with confidence score",
   * });
   * ```
   */
  register<T>(definition: NodeTypeDefinition<T>): void {
    if (this.types.has(definition.id)) {
      throw UploadistaError.fromCode("VALIDATION_ERROR", {
        body: `Node type "${definition.id}" is already registered. Types cannot be modified or re-registered.`,
        details: { typeId: definition.id },
      });
    }

    // Store as unknown to avoid generic constraints in the Map
    this.types.set(definition.id, definition as NodeTypeDefinition<unknown>);
  }

  /**
   * Retrieve a registered type definition by its ID.
   *
   * @param id - The unique type identifier (e.g., "storage-output-v1")
   * @returns The type definition if found, undefined otherwise
   *
   * @example
   * ```typescript
   * const def = flowTypeRegistry.get("storage-output-v1");
   * if (def) {
   *   console.log(`Found ${def.description} (v${def.version})`);
   * } else {
   *   console.warn("Type not registered");
   * }
   * ```
   */
  get(id: string): NodeTypeDefinition<unknown> | undefined {
    return this.types.get(id);
  }

  /**
   * List all registered types in a specific category.
   *
   * @param category - The node category to filter by ("input" or "output")
   * @returns Array of type definitions in the specified category
   *
   * @example
   * ```typescript
   * // List all registered output types
   * const outputTypes = flowTypeRegistry.listByCategory("output");
   * console.log("Available output types:");
   * for (const type of outputTypes) {
   *   console.log(`- ${type.id}: ${type.description}`);
   * }
   * ```
   */
  listByCategory(category: NodeTypeCategory): NodeTypeDefinition<unknown>[] {
    const result: NodeTypeDefinition<unknown>[] = [];
    for (const definition of this.types.values()) {
      if (definition.category === category) {
        result.push(definition);
      }
    }
    return result;
  }

  /**
   * Validate data against a registered type's schema.
   *
   * This method performs runtime validation using the Zod schema associated with
   * the type. If validation succeeds, the data is returned with proper typing.
   * If validation fails, an UploadistaError is returned with details.
   *
   * @template T - The expected TypeScript type after validation
   * @param typeId - The ID of the registered type to validate against
   * @param data - The data to validate
   * @returns A result object with either the validated data or an error
   *
   * @example
   * ```typescript
   * const result = flowTypeRegistry.validate("storage-output-v1", unknownData);
   *
   * if (result.success) {
   *   // TypeScript knows result.data is an UploadFile
   *   console.log(`File stored at: ${result.data.url}`);
   * } else {
   *   console.error(`Validation failed: ${result.error.body}`);
   * }
   * ```
   */
  validate<T>(typeId: string, data: unknown): ValidationResult<T> {
    const typeDef = this.types.get(typeId);

    if (!typeDef) {
      return {
        success: false,
        error: UploadistaError.fromCode("VALIDATION_ERROR", {
          body: `Node type "${typeId}" is not registered`,
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
          body: `Data validation failed for type "${typeId}"`,
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
   *
   * @example
   * ```typescript
   * if (flowTypeRegistry.has("custom-output-v1")) {
   *   console.log("Custom output type is available");
   * }
   * ```
   */
  has(id: string): boolean {
    return this.types.has(id);
  }

  /**
   * Get the total number of registered types.
   *
   * @returns The count of registered types
   *
   * @example
   * ```typescript
   * console.log(`Registry contains ${flowTypeRegistry.size()} types`);
   * ```
   */
  size(): number {
    return this.types.size;
  }
}

/**
 * Global singleton instance of the flow type registry.
 *
 * Use this instance to register and access node type definitions throughout
 * your application. The registry is initialized once and shared globally.
 *
 * @example
 * ```typescript
 * import { flowTypeRegistry } from "@uploadista/core/flow";
 *
 * // Register a type
 * flowTypeRegistry.register({
 *   id: "my-output-v1",
 *   category: "output",
 *   schema: mySchema,
 *   version: "1.0.0",
 *   description: "My custom output type",
 * });
 *
 * // Validate data
 * const result = flowTypeRegistry.validate("my-output-v1", data);
 * ```
 */
export const flowTypeRegistry = new FlowTypeRegistry();

/**
 * Validates flow input data against a registered node type.
 *
 * This helper function looks up the node type by ID and validates the provided
 * data against its schema. It's specifically designed for input validation
 * before flow execution.
 *
 * @param typeId - The registered type ID (e.g., "streaming-input-v1")
 * @param data - The input data to validate
 * @returns A validation result with either the typed data or an error
 *
 * @example
 * ```typescript
 * import { validateFlowInput } from "@uploadista/core/flow";
 *
 * const result = validateFlowInput("streaming-input-v1", {
 *   operation: "url",
 *   url: "https://example.com/image.jpg"
 * });
 *
 * if (result.success) {
 *   console.log("Valid input:", result.data);
 * } else {
 *   console.error("Validation error:", result.error);
 * }
 * ```
 */
export function validateFlowInput<T = unknown>(
  typeId: string,
  data: unknown,
): ValidationResult<T> {
  return flowTypeRegistry.validate<T>(typeId, data);
}
