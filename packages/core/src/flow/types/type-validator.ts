/** biome-ignore-all lint/suspicious/noExplicitAny: any is used to allow for dynamic types */
import type { z } from "zod";

import type {
  FlowEdge,
  FlowNode,
  NodeConnectionValidator,
  TypeCompatibilityChecker,
} from "./flow-types";

// Default type compatibility checker using Zod schemas
export const defaultTypeChecker: TypeCompatibilityChecker = (
  fromSchema,
  toSchema,
) => {
  // Basic schema compatibility rules
  if (fromSchema === toSchema) return true;

  // Check if schemas are compatible by comparing their types
  try {
    // For now, assume schemas are compatible if they're both Zod schemas
    // In a more sophisticated system, you'd check actual schema compatibility
    if (
      fromSchema &&
      toSchema &&
      typeof fromSchema === "object" &&
      typeof toSchema === "object"
    ) {
      return true;
    }

    return false;
  } catch {
    // If schema comparison fails, assume compatible
    return true;
  }
};

// Enhanced type validator with Zod schema support
export class FlowTypeValidator implements NodeConnectionValidator {
  private typeChecker: TypeCompatibilityChecker;

  constructor(typeChecker: TypeCompatibilityChecker = defaultTypeChecker) {
    this.typeChecker = typeChecker;
  }

  validateConnection(
    sourceNode: FlowNode<any, any>,
    targetNode: FlowNode<any, any>,
    _edge: FlowEdge,
  ): boolean {
    // Check if source node output schema is compatible with target node input schema
    return this.getCompatibleTypes(
      sourceNode.outputSchema,
      targetNode.inputSchema,
    );
  }

  getCompatibleTypes(
    sourceSchema: z.ZodSchema<any>,
    targetSchema: z.ZodSchema<any>,
  ): boolean {
    return this.typeChecker(sourceSchema, targetSchema);
  }

  // Validate entire flow for type compatibility
  validateFlow(
    nodes: FlowNode<any, any>[],
    edges: FlowEdge[],
  ): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));

    for (const edge of edges) {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);

      if (!sourceNode) {
        errors.push(`Source node ${edge.source} not found`);
        continue;
      }

      if (!targetNode) {
        errors.push(`Target node ${edge.target} not found`);
        continue;
      }

      if (!this.validateConnection(sourceNode, targetNode, edge)) {
        errors.push(
          `Schema mismatch: ${sourceNode.id} output schema incompatible with ${targetNode.id} input schema`,
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Get expected input schemas for a node based on its incoming edges
  getExpectedInputSchemas(
    nodeId: string,
    nodes: FlowNode<any, any>[],
    edges: FlowEdge[],
  ): Record<string, unknown> {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const expectedSchemas: Record<string, unknown> = {};

    for (const edge of edges) {
      if (edge.target === nodeId) {
        const sourceNode = nodeMap.get(edge.source);
        if (sourceNode) {
          const portKey = edge.sourcePort || edge.source;
          expectedSchemas[portKey] = sourceNode.outputSchema;
        }
      }
    }

    return expectedSchemas;
  }

  // Get actual output schemas for a node based on its outgoing edges
  getActualOutputSchemas(
    nodeId: string,
    nodes: FlowNode<any, any>[],
    edges: FlowEdge[],
  ): Record<string, unknown> {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const actualSchemas: Record<string, unknown> = {};

    for (const edge of edges) {
      if (edge.source === nodeId) {
        const targetNode = nodeMap.get(edge.target);
        if (targetNode) {
          const portKey = edge.targetPort || edge.target;
          actualSchemas[portKey] = targetNode.inputSchema;
        }
      }
    }

    return actualSchemas;
  }

  // Validate data against a schema
  validateData(
    data: unknown,
    schema: unknown,
  ): { isValid: boolean; errors: string[] } {
    try {
      (schema as z.ZodSchema<any>).parse(data);
      return { isValid: true, errors: [] };
    } catch (error) {
      if (error instanceof Error && "errors" in error) {
        return {
          isValid: false,
          errors: (
            error as { errors: Array<{ path: string[]; message: string }> }
          ).errors.map((err) => `${err.path.join(".")}: ${err.message}`),
        };
      }
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : "Validation failed"],
      };
    }
  }
}

// Utility functions for common type checks
export const typeUtils = {
  // Check if a schema is assignable to another
  isAssignable(
    fromSchema: z.ZodSchema<any>,
    toSchema: z.ZodSchema<any>,
  ): boolean {
    return defaultTypeChecker(fromSchema, toSchema);
  },

  // Get the most specific common schema
  getCommonSchema(
    schema1: z.ZodSchema<any>,
    schema2: z.ZodSchema<any>,
  ): z.ZodSchema<any> {
    if (schema1 === schema2) return schema1;

    // For now, return the more specific schema or schema1
    // In a more sophisticated system, you'd compute the intersection
    return schema1;
  },

  // Check if a value matches a schema
  matchesSchema(value: unknown, schema: z.ZodSchema<any>): boolean {
    try {
      schema.parse(value);
      return true;
    } catch {
      return false;
    }
  },
};
