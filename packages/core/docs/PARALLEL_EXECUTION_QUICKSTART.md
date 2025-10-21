# Parallel Execution - Quick Start Guide

## TL;DR

The `ParallelScheduler` now uses Effect's native concurrency primitives instead of broken Semaphore dependencies. Enable parallel execution with one config option.

## Enable Parallel Execution

Add `parallelExecution` to your flow config:

```typescript
const flow = yield* createFlowWithSchema({
  flowId: 'my-flow',
  name: 'My Flow',
  nodes: [inputNode, processA, processB, mergeNode, outputNode],
  edges: [
    { source: 'input', target: 'processA' },
    { source: 'input', target: 'processB' },
    { source: 'processA', target: 'merge' },
    { source: 'processB', target: 'merge' },
    { source: 'merge', target: 'output' }
  ],
  inputSchema: myInputSchema,
  outputSchema: myOutputSchema,
  parallelExecution: {
    enabled: true,
    maxConcurrency: 4,
  },
});
```

## How It Works

1. **Dependency Analysis**: Nodes are automatically grouped by their dependencies
2. **Level-Based Execution**:
   - Nodes with no dependencies (Level 0)
   - Nodes depending on Level 0 (Level 1)
   - And so on...
3. **Parallel Within Levels**: Nodes at the same level run in parallel
4. **Sequential Between Levels**: Levels run one after another

### Example Flow

```
Input → [Resize ║ Optimize] → Merge → Output
         └─ Level 1 (parallel) ─┘
```

- Input runs first
- Resize and Optimize run in parallel
- Merge waits for both to complete
- Output runs last

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `false` | Enable/disable parallel execution |
| `maxConcurrency` | `4` | Max concurrent nodes per level |

## What Changed

### ParallelScheduler

**Before** (broken):
```typescript
// This didn't work - Semaphore doesn't exist
const resourceSemaphore = semaphore(maxConcurrency); // ERROR
async executeNodesInParallel(executors) { ... }
```

**After** (working):
```typescript
// Uses Effect's Effect.all() with concurrency option
executeNodesInParallel<T, E, R>(
  nodeExecutors: Array<() => Effect.Effect<T, E, R>>,
): Effect.Effect<T[], E, R> {
  return Effect.all(nodeExecutors.map((executor) => executor()), {
    concurrency: this.maxConcurrency,
  });
}
```

### Flow Engine

Automatic detection of `parallelExecution.enabled`:
- If `true`: Uses `ParallelScheduler` with level-based execution
- If `false` (default): Uses original sequential execution

## Performance Example

```
Sequential:  Input(1s) → Resize(2s) → Optimize(2s) → Merge(1s) → Output(1s) = 7s
Parallel:    Input(1s) → [Resize(2s) ║ Optimize(2s)] → Merge(1s) → Output(1s) = 5s
             Speedup: 28% faster
```

## Debugging

Enable debug logs to see execution levels:

```
Flow my-flow: Executing in parallel mode (maxConcurrency: 4)
Flow my-flow: Grouped nodes into 4 execution levels
Flow my-flow: Executing level 0 with nodes: input_1
Flow my-flow: Executing level 1 with nodes: resize_1, optimize_1
Flow my-flow: Executing level 2 with nodes: merge_1
Flow my-flow: Executing level 3 with nodes: output_1
```

## Introspection

```typescript
const scheduler = new ParallelScheduler({ maxConcurrency: 4 });

// See how nodes are grouped
const levels = scheduler.groupNodesByExecutionLevel(nodes, edges);
levels.forEach(level => {
  console.log(`Level ${level.level}: ${level.nodes.join(', ')}`);
});

// Get stats
const stats = scheduler.getStats();
console.log(`Max concurrency: ${stats.maxConcurrency}`);
```

## Backward Compatibility

✅ Existing flows work unchanged (parallel execution disabled by default)
✅ No breaking changes
✅ Add config option to opt-in to parallel execution

## Constraints

- **Dependencies enforced**: Nodes can't run before their inputs are ready
- **Level structure**: All nodes in a level must complete before next level starts
- **Concurrency limit**: Won't exceed `maxConcurrency` simultaneous executions
- **Error handling**: First error in a level stops the flow

## For More Details

See `/src/flow/PARALLEL_EXECUTION.md` for comprehensive documentation.
