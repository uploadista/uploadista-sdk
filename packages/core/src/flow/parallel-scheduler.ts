/**
 * Parallel execution scheduler for flow nodes.
 *
 * The ParallelScheduler analyzes flow dependencies and groups nodes into execution
 * levels where nodes at the same level can run in parallel. It manages concurrency
 * using semaphores to prevent resource exhaustion.
 *
 * @module flow/parallel-scheduler
 * @see {@link ParallelScheduler} for the main scheduler class
 *
 * @remarks
 * This scheduler is currently under development. The flow engine uses sequential
 * execution by default, but this provides the foundation for future parallel execution.
 */

import type { Semaphore } from "../utils/semaphore";
import { semaphore } from "../utils/semaphore";
import type { FlowNode } from "./types/flow-types";

/**
 * Represents a level in the execution hierarchy where all nodes can run in parallel.
 *
 * @property level - The execution level (0 = first to execute, higher = later)
 * @property nodes - Array of node IDs that can execute in parallel at this level
 */
export interface ExecutionLevel {
  level: number;
  nodes: string[];
}

/**
 * Configuration options for the ParallelScheduler.
 *
 * @property maxConcurrency - Maximum number of nodes to execute in parallel (default: 4)
 * @property resourceSemaphore - Optional custom semaphore for resource management
 */
export interface ParallelSchedulerConfig {
  maxConcurrency?: number;
  resourceSemaphore?: Semaphore;
}

/**
 * Scheduler for executing flow nodes in parallel while respecting dependencies.
 *
 * The scheduler performs topological sorting to identify nodes that can run
 * concurrently, then executes them in batches with controlled concurrency.
 *
 * @example
 * ```typescript
 * const scheduler = new ParallelScheduler({ maxConcurrency: 4 });
 *
 * // Group nodes by execution level
 * const levels = scheduler.groupNodesByExecutionLevel(nodes, edges);
 *
 * // Execute a batch of nodes in parallel
 * const results = await scheduler.executeNodesInParallel([
 *   () => executeNode("node1"),
 *   () => executeNode("node2"),
 *   () => executeNode("node3")
 * ]);
 * ```
 */
export class ParallelScheduler {
  private maxConcurrency: number;
  private resourceSemaphore: Semaphore;

  constructor(config: ParallelSchedulerConfig = {}) {
    this.maxConcurrency = config.maxConcurrency ?? 4;
    this.resourceSemaphore =
      config.resourceSemaphore ?? semaphore(this.maxConcurrency);
  }

  /**
   * Groups nodes into execution levels where nodes in the same level can run in parallel
   * @param nodes Array of flow nodes
   * @param edges Array of flow edges
   * @returns Array of execution levels
   */
  groupNodesByExecutionLevel(
    nodes: FlowNode<unknown, unknown>[],
    edges: Array<{ source: string; target: string }>,
  ): ExecutionLevel[] {
    // Build dependency graph
    const graph: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};

    // Initialize
    nodes.forEach((node) => {
      graph[node.id] = [];
      inDegree[node.id] = 0;
    });

    // Build edges and calculate in-degrees
    edges.forEach((edge) => {
      graph[edge.source]?.push(edge.target);
      inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
    });

    const levels: ExecutionLevel[] = [];
    const processedNodes = new Set<string>();
    let levelIndex = 0;

    while (processedNodes.size < nodes.length) {
      // Find all nodes with zero in-degree that haven't been processed
      const currentLevelNodes = Object.keys(inDegree).filter(
        (nodeId) => inDegree[nodeId] === 0 && !processedNodes.has(nodeId),
      );

      if (currentLevelNodes.length === 0) {
        throw new Error(
          "Cycle detected in flow graph - cannot execute in parallel",
        );
      }

      levels.push({
        level: levelIndex++,
        nodes: currentLevelNodes,
      });

      // Remove current level nodes and update in-degrees
      currentLevelNodes.forEach((nodeId) => {
        processedNodes.add(nodeId);
        delete inDegree[nodeId];

        // Decrease in-degree for all dependent nodes
        graph[nodeId]?.forEach((dependentId) => {
          if (inDegree[dependentId] !== undefined) {
            inDegree[dependentId]--;
          }
        });
      });
    }

    return levels;
  }

  /**
   * Executes a batch of nodes in parallel with resource management
   * @param nodeExecutors Array of async functions that execute individual nodes
   * @returns Promise that resolves when all nodes complete
   */
  async executeNodesInParallel<T>(
    nodeExecutors: Array<() => Promise<T>>,
  ): Promise<T[]> {
    const results: T[] = [];
    const errors: Error[] = [];

    // Execute all node executors in parallel with semaphore control
    const promises = nodeExecutors.map(async (executor, index) => {
      const permit = await this.resourceSemaphore.acquire();

      try {
        const result = await executor();
        results[index] = result;
        return result;
      } catch (error) {
        errors[index] = error as Error;
        throw error;
      } finally {
        await permit.release();
      }
    });

    try {
      await Promise.all(promises);
      return results;
    } catch (error) {
      // If any node fails, we still want to return partial results
      // The calling code can decide how to handle partial failures
      if (errors.length > 0) {
        const firstError = errors.find((e) => e !== undefined);
        if (firstError) {
          throw firstError;
        }
      }
      throw error;
    }
  }

  /**
   * Determines if nodes can be safely executed in parallel
   * @param nodes Nodes to check
   * @param nodeResults Current execution results
   * @returns true if all nodes have their dependencies satisfied
   */
  canExecuteInParallel(
    nodeIds: string[],
    nodeResults: Map<string, unknown>,
    reverseGraph: Record<string, string[]>,
  ): boolean {
    return nodeIds.every((nodeId) => {
      const dependencies = reverseGraph[nodeId] || [];
      return dependencies.every((depId) => nodeResults.has(depId));
    });
  }

  /**
   * Gets execution statistics for monitoring
   */
  getStats() {
    return {
      maxConcurrency: this.maxConcurrency,
      // Could add more stats like current active tasks, total completed, etc.
    };
  }
}
