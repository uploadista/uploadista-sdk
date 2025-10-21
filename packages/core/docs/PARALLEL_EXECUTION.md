# Parallel Flow Execution

The uploadista flow engine now supports parallel execution of independent nodes using Effect's native concurrency primitives, significantly improving performance for complex flows with multiple processing branches.

## Overview

The parallel execution feature automatically identifies nodes that can run concurrently (nodes that don't depend on each other) and groups them into execution levels. Nodes within the same level are executed in parallel with controlled concurrency, while different levels are executed sequentially to maintain dependencies.

## Key Features

- **Automatic Dependency Analysis**: The scheduler analyzes the flow graph and groups independent nodes into parallel execution levels using Kahn's algorithm
- **Effect-Based Concurrency**: Uses Effect's `Effect.all()` with concurrency limits to manage parallel execution safely
- **Backward Compatibility**: Falls back to sequential execution when parallel execution is disabled (default behavior)
- **Error Handling**: Proper error propagation and failure handling across parallel branches
- **Type-Safe**: Full TypeScript support with proper Effect typing

## Usage

To enable parallel execution, set the `parallelExecution` option when creating a flow:

```typescript
import { createFlowWithSchema } from '@uploadista/core/flow';

const flow = yield* createFlowWithSchema({
  flowId: 'my-parallel-flow',
  name: 'Parallel Processing Flow',
  nodes: [inputNode, processA, processB, processC, mergeNode, outputNode],
  edges: [
    { source: 'input', target: 'processA' },
    { source: 'input', target: 'processB' },
    { source: 'input', target: 'processC' },
    { source: 'processA', target: 'merge' },
    { source: 'processB', target: 'merge' },
    { source: 'processC', target: 'merge' },
    { source: 'merge', target: 'output' }
  ],
  inputSchema: myInputSchema,
  outputSchema: myOutputSchema,
  parallelExecution: {
    enabled: true,
    maxConcurrency: 4, // Maximum number of concurrent nodes per level
  },
});
```

## Configuration Options

- `enabled`: Boolean flag to enable/disable parallel execution (default: `false`)
- `maxConcurrency`: Maximum number of nodes to execute concurrently within a level (default: `4`)

## How It Works

### 1. Dependency Analysis
The scheduler analyzes the flow graph using Kahn's algorithm to build a dependency graph and calculate the in-degree (number of dependencies) for each node.

### 2. Level Grouping
Nodes are grouped into execution levels based on their dependencies:
- **Level 0**: Input nodes (no dependencies)
- **Level 1**: Nodes that depend only on Level 0 nodes
- **Level N**: Nodes that depend on Level N-1 nodes

### 3. Parallel Execution with Effect
Within each level, nodes are executed in parallel using Effect's `Effect.all()` with concurrency control. This ensures:
- No more than `maxConcurrency` nodes execute simultaneously
- Resource exhaustion is prevented
- Proper error handling and cleanup

### 4. Sequential Level Processing
Levels are processed sequentially in a for loop. Each level completes before the next level begins, ensuring all dependencies are satisfied.

## Performance Benefits

Parallel execution can significantly reduce flow execution time, especially for:
- Image processing pipelines with multiple transformations
- Multi-branch conditional flows
- Independent data processing tasks
- Complex validation and transformation chains

Expected performance improvements depend on:
- Number of independent processing branches
- Individual node execution time
- Available system resources

## Example Flow Structure

```
Input Node
    ↓
┌─────────┼─────────┐
↓         ↓         ↓
ProcessA  ProcessB  ProcessC  ← Level 1 (parallel)
└─────────┼─────────┘
          ↓
      Merge Node              ← Level 2 (sequential)
          ↓
     Output Node              ← Level 3 (sequential)
```

In this example:
- ProcessA, ProcessB, and ProcessC run in parallel
- Merge Node waits for all parallel processes to complete
- Output Node processes the merged result

## Error Handling

If any node in a parallel level fails:
- The error is propagated immediately (Effect's `Promise.all` behavior)
- Remaining nodes in the level may continue, but the flow halts
- Error details are available for debugging
- Resources are properly cleaned up through Effect's resource management

## Monitoring and Debugging

The parallel scheduler provides execution level information and statistics:

```typescript
const scheduler = new ParallelScheduler({ maxConcurrency: 4 });

// Get execution levels
const levels = scheduler.groupNodesByExecutionLevel(nodes, edges);
console.log(`Flow has ${levels.length} execution levels`);
levels.forEach(level => {
  console.log(`Level ${level.level}: [${level.nodes.join(', ')}]`);
});

// Get scheduler stats
const stats = scheduler.getStats();
console.log(`Max concurrency: ${stats.maxConcurrency}`);
```

### Debug Logging

When parallel execution is enabled, the flow engine emits debug logs:
```
Flow my-flow: Executing in parallel mode (maxConcurrency: 4)
Flow my-flow: Grouped nodes into 3 execution levels
Flow my-flow: Executing level 0 with nodes: input_1
Flow my-flow: Executing level 1 with nodes: resize_1, optimize_1
Flow my-flow: Executing level 2 with nodes: output_1
```

## Limitations & Considerations

- **Pausable nodes**: If a node pauses in a level, the entire level pauses
- **Conditional nodes**: Conditions are evaluated before parallel execution begins; the node is either included or skipped for the level
- **Multi-input nodes**: Must have all dependencies completed before execution (enforced by level grouping)
- **Resource-intensive nodes**: May benefit from lower `maxConcurrency` settings to prevent resource contention

## Migration from Sequential Flows

Existing flows work without any changes:
- Default behavior remains sequential execution (`enabled: false`)
- Enable parallel execution by adding the `parallelExecution` configuration
- No changes required to existing node implementations
- Flows automatically respect dependency constraints

## Implementation Details

The parallel execution system consists of three main components:

### 1. ParallelScheduler (`parallel-scheduler.ts`)
- Analyzes flow dependencies using Kahn's algorithm
- Groups nodes into execution levels
- Provides `executeNodesInParallel()` which uses `Effect.all()` with concurrency control
- Type-safe Effect-based API with full TypeScript support

```typescript
const scheduler = new ParallelScheduler({ maxConcurrency: 4 });
const levels = scheduler.groupNodesByExecutionLevel(nodes, edges);
const results = yield* scheduler.executeNodesInParallel(executors);
```

### 2. Flow Engine Integration (`flow.ts`)
- Detects when `parallelExecution.enabled` is true
- Switches between sequential and parallel execution paths
- Maintains backward compatibility (sequential is default)
- Properly handles paused nodes in parallel execution

### 3. Effect-Based Concurrency
Uses Effect's `Effect.all()` with `concurrency` option:
```typescript
Effect.all(nodeExecutors, { concurrency: maxConcurrency })
```
This ensures resource-safe parallel execution without manual semaphore management.

## Performance Characteristics

### Best Case Scenarios
- **Independent processing branches**: 3+ parallel nodes can reduce execution time proportionally
- **I/O-bound operations**: Network calls or disk I/O can run concurrently
- **CPU-bound with other operations**: Can interleave with other workloads

### Example Performance Gain
```
Sequential: Input (1s) → Resize (2s) → Optimize (2s) → Output (1s) = 6 seconds
Parallel:   Input (1s) → [Resize (2s) + Optimize (2s) in parallel] → Output (1s) = 4 seconds
            Speedup: 33% faster with just 2 parallel operations
```

## Future Enhancements

Potential improvements for future releases:
- Dynamic concurrency adjustment based on resource availability
- Per-node concurrency limits for resource-intensive operations
- Parallel level visualization in flow builder
- Performance metrics collection and reporting