/**
 * Parallel execution scheduler for flow nodes.
 *
 * The ParallelScheduler analyzes flow dependencies and groups nodes into execution
 * levels where nodes at the same level can run in parallel. It manages concurrency
 * using Effect's built-in concurrency control to prevent resource exhaustion.
 *
 * @module flow/parallel-scheduler
 * @see {@link ParallelScheduler} for the main scheduler class
 *
 * @remarks
 * This scheduler groups nodes by execution level (respecting dependencies) and executes
 * each level in parallel with controlled concurrency. Levels are executed sequentially
 * to ensure dependencies are satisfied before dependent nodes execute.
 *
 * @example
 * ```typescript
 * const scheduler = new ParallelScheduler({ maxConcurrency: 4 });
 *
 * // Group nodes by execution level
 * const levels = scheduler.groupNodesByExecutionLevel(nodes, edges);
 *
 * // Execute nodes in a level with Effect
 * const results = yield* scheduler.executeNodesInParallel([
 *   () => executeNode("node1"),
 *   () => executeNode("node2"),
 *   () => executeNode("node3")
 * ]);
 * ```
 */

import { Effect } from "effect";
import type { FlowNode } from "./types/flow-types";

/**
 * Represents a level in the execution hierarchy where all nodes can run in parallel.
 *
 * @property level - The execution level (0 = first to execute, higher = later)
 * @property nodes - Array of node IDs that can execute in parallel at this level
 *
 * @example
 * ```
 * Level 0: [input_node]           (no dependencies)
 * Level 1: [resize, optimize]     (all depend on level 0)
 * Level 2: [storage]              (depends on level 1)
 * ```
 */
export interface ExecutionLevel {
  level: number;
  nodes: string[];
}

/**
 * Configuration options for the ParallelScheduler.
 *
 * @property maxConcurrency - Maximum number of nodes to execute in parallel (default: 4)
 *                           Controls how many nodes run simultaneously within a level
 *
 * @example
 * ```typescript
 * const scheduler = new ParallelScheduler({ maxConcurrency: 8 });
 * ```
 */
export interface ParallelSchedulerConfig {
  maxConcurrency?: number;
}

/**
 * Scheduler for executing flow nodes in parallel while respecting dependencies.
 *
 * The scheduler performs topological sorting to identify nodes that can run
 * concurrently, groups them into execution levels, and provides methods to
 * execute them with controlled concurrency using Effect.
 *
 * Key responsibilities:
 * - Analyze flow dependencies and detect cycles
 * - Group nodes into parallel execution levels
 * - Execute levels in parallel with concurrency limits
 * - Provide utilities to check parallel execution feasibility
 */
export class ParallelScheduler {
  private maxConcurrency: number;

  /**
   * Creates a new ParallelScheduler instance.
   *
   * @param config - Configuration for the scheduler
   * @example
   * ```typescript
   * const scheduler = new ParallelScheduler({ maxConcurrency: 4 });
   * ```
   */
  constructor(config: ParallelSchedulerConfig = {}) {
    this.maxConcurrency = config.maxConcurrency ?? 4;
  }

  /**
   * Groups nodes into execution levels where nodes in the same level can run in parallel.
   *
   * Uses Kahn's algorithm to perform topological sorting with level identification.
   * Nodes are grouped by their distance from source nodes (input nodes with no dependencies).
   *
   * @param nodes - Array of flow nodes to analyze
   * @param edges - Array of edges defining dependencies between nodes
   * @returns Array of execution levels, ordered from 0 (no dependencies) onwards
   * @throws Error if a cycle is detected in the flow graph
   *
   * @example
   * ```typescript
   * const levels = scheduler.groupNodesByExecutionLevel(nodes, edges);
   * // levels = [
   * //   { level: 0, nodes: ['input_1'] },
   * //   { level: 1, nodes: ['resize_1', 'optimize_1'] },
   * //   { level: 2, nodes: ['output_1'] }
   * // ]
   * ```
   */
  groupNodesByExecutionLevel(
    nodes: FlowNode<unknown, unknown>[],
    edges: Array<{ source: string; target: string }>,
  ): ExecutionLevel[] {
    // Build dependency graph
    const graph: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};

    // Initialize graph structure
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

    // Use Kahn's algorithm to group nodes by level
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

      // Remove current level nodes and update in-degrees for dependent nodes
      currentLevelNodes.forEach((nodeId) => {
        processedNodes.add(nodeId);
        delete inDegree[nodeId];

        // Decrease in-degree for all nodes that depend on this node
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
   * Executes a batch of Effect-based node executors in parallel with concurrency control.
   *
   * All executors are run in parallel, but the number of concurrent executions is limited
   * by maxConcurrency. This prevents resource exhaustion while maximizing parallelism.
   *
   * @template T - The return type of each executor
   * @template E - The error type of the Effects
   * @template R - The requirements type of the Effects
   *
   * @param nodeExecutors - Array of Effect-returning functions to execute in parallel
   * @returns Effect that resolves to array of results in the same order as input
   *
   * @example
   * ```typescript
   * const results = yield* scheduler.executeNodesInParallel([
   *   () => executeNode("node1"),
   *   () => executeNode("node2"),
   *   () => executeNode("node3")
   * ]);
   * // results will be in order: [result1, result2, result3]
   * ```
   */
  executeNodesInParallel<T, E, R>(
    nodeExecutors: Array<() => Effect.Effect<T, E, R>>,
  ): Effect.Effect<T[], E, R> {
    return Effect.all(
      nodeExecutors.map((executor) => executor()),
      {
        concurrency: this.maxConcurrency,
      },
    );
  }

  /**
   * Determines if a set of nodes can be safely executed in parallel.
   *
   * Nodes can execute in parallel if all their dependencies have been completed.
   * This is typically called to verify that nodes in an execution level are ready
   * to run given the current node results.
   *
   * @param nodeIds - Array of node IDs to check
   * @param nodeResults - Map of completed node IDs to their results
   * @param reverseGraph - Dependency graph mapping node IDs to their incoming dependencies
   * @returns true if all dependencies for all nodes are in nodeResults, false otherwise
   *
   * @example
   * ```typescript
   * const canRun = scheduler.canExecuteInParallel(
   *   ['resize_1', 'optimize_1'],
   *   nodeResults,
   *   reverseGraph
   * );
   * ```
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
   * Gets execution statistics for monitoring and debugging.
   *
   * @returns Object containing current scheduler configuration
   *
   * @example
   * ```typescript
   * const stats = scheduler.getStats();
   * console.log(`Max concurrency: ${stats.maxConcurrency}`);
   * ```
   */
  getStats() {
    return {
      maxConcurrency: this.maxConcurrency,
    };
  }
}
