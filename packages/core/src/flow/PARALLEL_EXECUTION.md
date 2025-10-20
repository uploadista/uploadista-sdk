# Parallel Flow Execution

The uploadista flow engine now supports parallel execution of independent nodes, significantly improving performance for complex flows with multiple processing branches.

## Overview

The parallel execution feature automatically identifies nodes that can run concurrently (nodes that don't depend on each other) and groups them into execution levels. Nodes within the same level are executed in parallel, while different levels are executed sequentially to maintain dependencies.

## Key Features

- **Automatic Dependency Analysis**: The scheduler analyzes the flow graph and groups independent nodes into parallel execution levels
- **Resource Management**: Uses semaphores to control concurrency and prevent resource exhaustion
- **Backward Compatibility**: Falls back to sequential execution when parallel execution is disabled
- **Error Handling**: Proper error propagation and failure handling across parallel branches

## Usage

To enable parallel execution, set the `parallelExecution` option when creating a flow:

```typescript
import { createFlow } from '@uploadista/core/flow';

const flow = createFlow({
  flowId: 'my-parallel-flow',
  name: 'Parallel Processing Flow',
  nodes: [...],
  edges: [...],
  inputSchema: myInputSchema,
  outputSchema: myOutputSchema,
  parallelExecution: {
    enabled: true,
    maxConcurrency: 4, // Maximum number of concurrent nodes
  },
});
```

## Configuration Options

- `enabled`: Boolean flag to enable/disable parallel execution (default: false)
- `maxConcurrency`: Maximum number of nodes that can execute simultaneously (default: 4)

## How It Works

### 1. Dependency Analysis
The scheduler builds a dependency graph from the flow edges and calculates the in-degree (number of dependencies) for each node.

### 2. Level Grouping
Nodes are grouped into execution levels using a modified topological sort:
- **Level 0**: Input nodes (no dependencies)
- **Level 1**: Nodes that depend only on Level 0 nodes
- **Level N**: Nodes that depend on previous levels

### 3. Parallel Execution
Within each level, nodes are executed in parallel using Promise.all() with semaphore-controlled resource management.

### 4. Sequential Level Processing
Levels are processed sequentially to ensure dependencies are satisfied before dependent nodes execute.

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
- All other nodes in the same level continue execution
- The flow stops at the failed level
- Error details are propagated to the caller
- Resources are properly cleaned up

## Monitoring and Debugging

The parallel scheduler provides statistics and debugging information:

```typescript
const scheduler = new ParallelScheduler({ maxConcurrency: 4 });
const stats = scheduler.getStats();
console.log('Max concurrency:', stats.maxConcurrency);
```

## Limitations

- Conditional nodes may affect parallel execution paths
- Multi-input nodes require all dependencies to complete before execution
- Resource-intensive nodes may benefit from lower concurrency limits

## Migration from Sequential Flows

Existing flows work without changes:
- Default behavior remains sequential execution
- Enable parallel execution by adding the configuration option
- No changes required to existing node implementations

## Implementation Details

The parallel execution system consists of:
- `ParallelScheduler`: Manages execution levels and resource allocation  
- `ExecutionLevel`: Groups nodes that can run concurrently
- Modified flow engine: Switches between parallel and sequential execution
- Semaphore-based concurrency control: Prevents resource exhaustion