# Circuit Breaker Pattern

The circuit breaker pattern prevents cascade failures in the flow engine by monitoring node execution failures and automatically stopping requests to failing services.

## Overview

When external services (like AI APIs, virus scanners, etc.) experience degraded performance or outages, the circuit breaker:

1. **Detects systematic failures** using a sliding window
2. **Stops sending requests** to failing services (opens the circuit)
3. **Provides graceful degradation** via configurable fallbacks
4. **Automatically recovers** when services become healthy (closes the circuit)

## State Machine

```
   failures < threshold          timeout expires
         ┌───────┐                ┌───────────┐
         │       │                │           │
         ▼       │                ▼           │
      CLOSED ────┴───────► OPEN ─────────► HALF-OPEN
         ▲                                    │
         │                                    │
         └────────────────────────────────────┘
                  success in half-open
```

- **CLOSED**: Normal operation, tracking failures in sliding window
- **OPEN**: Rejecting all requests immediately, waiting for reset timeout
- **HALF-OPEN**: Allowing limited test requests to probe service health

## Configuration

### Flow-Level Configuration

Configure default circuit breaker settings for all nodes in a flow:

```typescript
const flow = yield* createFlowWithSchema({
  flowId: "my-flow",
  name: "My Flow",
  nodes: [...],
  edges: [...],
  inputSchema,
  outputSchema,
  circuitBreaker: {
    defaults: {
      enabled: true,
      failureThreshold: 5,
      resetTimeout: 30000, // 30 seconds
      halfOpenRequests: 3,
      windowDuration: 60000, // 1 minute
      fallback: { type: "fail" }
    },
    // Override settings for specific node types (by nodeTypeId)
    nodeTypeOverrides: {
      "describe-image": {
        failureThreshold: 10,
        fallback: { type: "skip", passThrough: true }
      },
      "scan-virus": {
        failureThreshold: 3,
        fallback: { type: "fail" }
      }
    }
  }
});
```

### Node-Level Configuration

Configure circuit breaker for individual nodes (overrides flow defaults):

```typescript
const myNode = yield* createFlowNode({
  id: "my-node",
  name: "My Node",
  description: "Node with circuit breaker",
  type: NodeType.process,
  nodeTypeId: "my-external-service", // Stable ID for circuit breaker state
  inputSchema,
  outputSchema,
  run: ({ data }) => Effect.gen(function* () {
    // Node logic
    return { type: "complete", data: result };
  }),
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    resetTimeout: 30000,
    halfOpenRequests: 3,
    windowDuration: 60000,
    fallback: { type: "fail" }
  }
});
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable circuit breaker for this node |
| `failureThreshold` | number | `5` | Number of failures to trip the circuit |
| `resetTimeout` | number | `30000` | Milliseconds to wait before half-open |
| `halfOpenRequests` | number | `3` | Successful requests needed to close |
| `windowDuration` | number | `60000` | Sliding window duration in milliseconds |
| `fallback` | object | `{ type: "fail" }` | Behavior when circuit is open |

## Built-in Node Defaults

The following Uploadista nodes come with sensible circuit breaker defaults pre-configured. Users benefit from circuit breaker protection without any additional configuration.

### AI/External Service Nodes

| Node | `nodeTypeId` | Threshold | Timeout | Fallback |
|------|--------------|-----------|---------|----------|
| Describe Image | `describe-image` | 5 | 60s | skip + passThrough |
| Remove Background | `remove-background` | 5 | 60s | skip + passThrough |
| Convert to Markdown | `convert-to-markdown` | 5 | 60s | skip + passThrough |
| OCR | `ocr` | 5 | 60s | skip + passThrough |
| Scan Virus | `scan-virus` | 5 | 60s | **fail** |

**Note:** The Scan Virus node uses `fallback: { type: "fail" }` because security checks should never be silently skipped.

### Overriding Defaults

You can override the built-in defaults at the flow level using `nodeTypeOverrides`:

```typescript
const flow = yield* createFlow({
  // ...
  circuitBreaker: {
    nodeTypeOverrides: {
      // Make AI description more tolerant
      "describe-image": {
        failureThreshold: 10,
        resetTimeout: 120000, // 2 minutes
      },
      // Allow virus scan to be skipped in dev environment
      "scan-virus": {
        enabled: process.env.NODE_ENV === "production",
      },
    },
  },
});
```

## Fallback Behaviors

### Fail (Default)

Immediately fails with `CIRCUIT_BREAKER_OPEN` error:

```typescript
fallback: { type: "fail" }
```

### Skip with Pass-Through

Skips the node and passes input through as output:

```typescript
fallback: { type: "skip", passThrough: true }
```

### Default Value

Returns a configured default value:

```typescript
fallback: { type: "default", value: { status: "skipped" } }
```

## Circuit Breaker Scope

Circuit breakers are scoped **per node type** using `nodeTypeId`. This means:

- All nodes with the same `nodeTypeId` share circuit state
- If a service is down, all nodes using it will see the open circuit
- Different node types have independent circuit breakers

The `nodeTypeId` is a stable identifier (e.g., `"describe-image"`, `"scan-virus"`) that doesn't change when node names are updated for display purposes.

```typescript
const myNode = yield* createFlowNode({
  id: "my-unique-id",
  name: "Describe Image",  // Display name (can change)
  nodeTypeId: "describe-image",  // Stable ID for circuit breaker
  // ...
});
```

## Observability

### Metrics

The following metrics are available:

| Metric | Type | Description |
|--------|------|-------------|
| `circuit_breaker_open_total` | Counter | Times circuits opened |
| `circuit_breaker_close_total` | Counter | Times circuits closed |
| `circuit_breaker_rejected_total` | Counter | Requests rejected |
| `circuit_breaker_half_open_total` | Counter | Times circuits went half-open |
| `circuit_breaker_state` | Gauge | Current state (0=closed, 1=open, 2=half-open) |
| `circuit_breaker_failures` | Gauge | Failures in sliding window |

### Tracing

Circuit breaker spans include:

- `circuit_breaker.node_type_id` - The node type ID
- `circuit_breaker.state` - Current state
- `circuit_breaker.failure_count` - Failures in window
- `circuit_breaker.decision` - allowed/rejected/fallback

## Example: AI Image Processing Flow

With built-in defaults, AI nodes automatically have circuit breaker protection:

```typescript
import { createDescribeImageNode, createRemoveBackgroundNode } from "@uploadista/flow-images-nodes";

// These nodes come with circuit breaker defaults pre-configured!
const describeNode = yield* createDescribeImageNode("describe");
const removeBackgroundNode = yield* createRemoveBackgroundNode("remove-bg");

const flow = yield* createFlowWithSchema({
  flowId: "ai-image-flow",
  name: "AI Image Processing",
  nodes: [inputNode, describeNode, removeBackgroundNode, storageNode],
  edges: [
    { source: "input", target: "describe" },
    { source: "describe", target: "remove-bg" },
    { source: "remove-bg", target: "storage" }
  ],
  inputSchema,
  outputSchema,
  // Optional: Override defaults if needed
  circuitBreaker: {
    nodeTypeOverrides: {
      // Use custom fallback for AI description
      "describe-image": {
        fallback: {
          type: "default",
          value: { description: "Description unavailable" }
        }
      }
    }
  }
});
```

## Enabling Circuit Breakers

Circuit breakers require a `CircuitBreakerStoreService` to be provided in the Effect context. Without it, circuit breakers are automatically disabled (requests always pass through).

```typescript
import {
  kvCircuitBreakerStoreLayer,
  memoryCircuitBreakerStoreLayer,
} from "@uploadista/core";

// For production clusters: Use KV store (Redis, etc.)
const program = flow.run({ ... }).pipe(
  Effect.provide(kvCircuitBreakerStoreLayer),
  Effect.provide(redisKvStore({ redis: redisClient }))
);

// For single-instance or testing: Use in-memory store
const testProgram = flow.run({ ... }).pipe(
  Effect.provide(memoryCircuitBreakerStoreLayer)
);
```

## Distributed State (Cluster Deployments)

Circuit breakers use a distributed store for state persistence, allowing multiple instances in a cluster to share circuit state.

### Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Instance 1    │    │   Instance 2    │    │   Instance 3    │
│                 │    │                 │    │                 │
│  Distributed    │    │  Distributed    │    │  Distributed    │
│  CircuitBreaker │    │  CircuitBreaker │    │  CircuitBreaker │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Shared KV Store     │
                    │   (Redis, etc.)       │
                    └───────────────────────┘
```

### Setup with KV Store

```typescript
import {
  makeKvCircuitBreakerStore,
  DistributedCircuitBreakerRegistry,
  CircuitBreakerStoreService,
  kvCircuitBreakerStoreLayer,
} from "@uploadista/core";

// Option 1: Create store directly
const baseKvStore = makeRedisBaseKvStore({ redis: redisClient });
const cbStore = makeKvCircuitBreakerStore(baseKvStore);
const registry = new DistributedCircuitBreakerRegistry(cbStore);

// Option 2: Use Effect layers
const program = Effect.gen(function* () {
  const cbStore = yield* CircuitBreakerStoreService;
  // Use the store...
}).pipe(
  Effect.provide(kvCircuitBreakerStoreLayer),
  Effect.provide(redisKvStore({ redis: redisClient }))
);
```

### Using Distributed Circuit Breakers

```typescript
const registry = new DistributedCircuitBreakerRegistry(store);

const breaker = registry.getOrCreate("describe-image", {
  enabled: true,
  failureThreshold: 5,
  resetTimeout: 30000
});

// Note: All operations are Effect-based for distributed breakers
const { allowed, state, failureCount } = yield* breaker.allowRequest();

if (!allowed) {
  // Handle circuit open with fallback
  const fallback = breaker.getFallback();
  // ...
}

// Record results
try {
  const result = yield* executeNode();
  yield* breaker.recordSuccess();
  return result;
} catch (error) {
  yield* breaker.recordFailure(error.message);
  throw error;
}
```

### Store Implementations

| Store | Use Case | Atomicity |
|-------|----------|-----------|
| `makeMemoryCircuitBreakerStore()` | Single instance, testing | Perfect |
| `makeKvCircuitBreakerStore(baseKvStore)` | Any KV backend | Eventual consistency |
| Custom Redis with Lua scripts | High-traffic clusters | Perfect |

### Consistency Trade-offs

The KV store adapter uses read-modify-write for increment operations, which may have minor race conditions under high concurrency. This is acceptable because:

1. **Circuit breakers tolerate eventual consistency** - If one instance trips the circuit and another sends a few more requests before syncing, the system is still protected
2. **State changes are infrequent** - Only happens when crossing thresholds
3. **Window expiry is handled** - Stale failure counts are reset automatically

For use cases requiring perfect atomicity, implement a custom store using Redis Lua scripts or database transactions.

## Best Practices

1. **Start Conservative**: Begin with higher thresholds and tune based on production data
2. **Different Services, Different Thresholds**: External APIs may need different settings than internal services
3. **Use Skip for Non-Critical Nodes**: Enhancement nodes (AI description) can often be skipped
4. **Monitor Circuit States**: Watch metrics to understand service health
5. **Test Fallback Behavior**: Ensure your fallbacks produce valid outputs for downstream nodes
6. **Always Provide CircuitBreakerStoreService**: Circuit breakers are disabled without a store layer
7. **Use KV Store in Production**: For cluster deployments, use `kvCircuitBreakerStoreLayer` with Redis or similar
8. **Consider Consistency Needs**: Most use cases work fine with eventual consistency
