# Dead Letter Queue (DLQ) Documentation

## Overview

The Dead Letter Queue (DLQ) provides automatic capture and retry capabilities for failed flow jobs. When a flow execution fails, the DLQ preserves the complete failure context including inputs, partial results, and error details for debugging, automatic retry, or manual intervention.

## Key Features

- **Automatic Failure Capture**: Failed flow jobs are automatically captured with full execution context
- **Configurable Retry Policies**: Support for immediate, fixed delay, and exponential backoff strategies
- **Error Filtering**: Configure which errors should be retried vs. non-retryable
- **Admin API**: RESTful endpoints for DLQ management (list, retry, resolve, cleanup)
- **Observability**: Event-based metrics and tracing for monitoring
- **TTL-based Cleanup**: Automatic expiration of old DLQ items

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Flow Execution                                   │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                              ┌────▼────┐
                              │  Fail?  │
                              └────┬────┘
                               Yes │
                    ┌──────────────▼──────────────────────┐
                    │      DeadLetterQueueService         │
                    │  ┌────────────────────────────────┐ │
                    │  │     DeadLetterItem             │ │
                    │  │  - jobId, flowId, storageId    │ │
                    │  │  - error details, inputs       │ │
                    │  │  - nodeResults, retryHistory   │ │
                    │  └────────────────────────────────┘ │
                    └──────────────────┬──────────────────┘
                                       │
                    ┌──────────────────▼──────────────────┐
                    │       DeadLetterQueueKVStore        │
                    │         (Persistent Storage)        │
                    └─────────────────────────────────────┘
```

## Quick Start

### 1. Enable DLQ in Flow Configuration

```typescript
import { createFlowWithSchema, type FlowDeadLetterQueueConfig } from "@uploadista/core";

const flowConfig = {
  flowId: "image-pipeline",
  name: "Image Processing Pipeline",
  nodes: [...],
  edges: [...],
  inputSchema: imageInputSchema,
  outputSchema: imageOutputSchema,
  // Enable DLQ with custom retry policy
  deadLetterQueue: {
    enabled: true,
    retryPolicy: {
      enabled: true,
      maxRetries: 5,
      backoff: {
        type: "exponential",
        initialDelayMs: 1000,
        maxDelayMs: 300000, // 5 minutes
        multiplier: 2,
        jitter: true
      },
      nonRetryableErrors: ["VALIDATION_ERROR", "AUTH_ERROR"],
      ttlMs: 604800000 // 7 days
    }
  }
};
```

### 2. Provide DLQ Service Layer

```typescript
import {
  DeadLetterQueueService,
  deadLetterQueueService,
  deadLetterQueueKvStore,
  BaseKvStoreService
} from "@uploadista/core";

// Provide the DLQ service in your Effect layer stack
const program = myFlowProgram.pipe(
  Effect.provide(deadLetterQueueService),
  Effect.provide(deadLetterQueueKvStore),
  Effect.provide(baseKvStoreLayer)
);
```

### 3. Access DLQ in Admin Handlers

```typescript
import { DeadLetterQueueService } from "@uploadista/core";

const adminHandler = Effect.gen(function* () {
  const dlq = yield* DeadLetterQueueService;

  // Get DLQ statistics
  const stats = yield* dlq.getStats();
  console.log(`Total DLQ items: ${stats.totalItems}`);

  // List pending items
  const { items, total } = yield* dlq.list({ status: "pending" });

  // Manual retry
  const item = yield* dlq.get(itemId);
  yield* dlq.markRetrying(item.id);
  // ... re-execute flow with item.inputs ...
  yield* dlq.markResolved(item.id);
});
```

## Retry Policies

### Backoff Strategies

#### Immediate
Retry immediately without delay. Use for transient errors that may succeed on immediate retry.

```typescript
const immediatePolicy = {
  enabled: true,
  maxRetries: 3,
  backoff: { type: "immediate" }
};
```

#### Fixed Delay
Wait a fixed duration between retries.

```typescript
const fixedPolicy = {
  enabled: true,
  maxRetries: 5,
  backoff: {
    type: "fixed",
    delayMs: 5000 // 5 seconds between retries
  }
};
```

#### Exponential Backoff
Progressively longer delays with optional jitter.

```typescript
const exponentialPolicy = {
  enabled: true,
  maxRetries: 5,
  backoff: {
    type: "exponential",
    initialDelayMs: 1000,   // Start with 1 second
    maxDelayMs: 300000,     // Cap at 5 minutes
    multiplier: 2,          // Double each time
    jitter: true            // Add randomness to prevent thundering herd
  }
};
// Delays: ~1s, ~2s, ~4s, ~8s, ~16s, ... capped at 5min
```

### Error Filtering

Control which errors trigger retries:

```typescript
const filteredPolicy = {
  enabled: true,
  maxRetries: 3,
  backoff: { type: "exponential", ... },
  // Only retry these errors
  retryableErrors: ["NETWORK_ERROR", "TIMEOUT_ERROR"],
  // Never retry these (takes precedence)
  nonRetryableErrors: ["VALIDATION_ERROR", "AUTH_ERROR", "PERMISSION_DENIED"]
};
```

## DLQ Item Lifecycle

```
┌─────────┐    Add      ┌─────────┐   Retry   ┌──────────┐
│  Flow   │ ─────────▶  │ pending │ ────────▶ │ retrying │
│ Failure │             └────┬────┘           └────┬─────┘
└─────────┘                  │                     │
                             │               ┌─────┴─────┐
                             │           Success      Failure
                             │               │           │
                     Max Retries         ┌───▼────┐  ┌───▼────┐
                         Reached         │resolved│  │pending │
                             │           └────────┘  └────────┘
                         ┌───▼─────┐                     │
                         │exhausted│◀────────────────────┘
                         └─────────┘                Max retries
```

### Status Meanings

- **pending**: Awaiting retry (scheduled or manual)
- **retrying**: Currently being retried
- **exhausted**: Max retries reached, requires manual intervention
- **resolved**: Successfully retried or manually resolved

## Admin API Endpoints

The DLQ provides RESTful admin endpoints for management:

### List DLQ Items
```
GET /api/admin/dlq
Query params: status, flowId, clientId, limit, offset
```

### Get Single Item
```
GET /api/admin/dlq/:itemId
```

### Retry Single Item
```
POST /api/admin/dlq/:itemId/retry
```

### Retry All Items
```
POST /api/admin/dlq/retry-all
Body: { status?: "pending", flowId?: string }
```

### Delete Item
```
DELETE /api/admin/dlq/:itemId
```

### Mark as Resolved
```
POST /api/admin/dlq/:itemId/resolve
```

### Cleanup Old Items
```
POST /api/admin/dlq/cleanup
Body: { olderThan?: Date, status?: "exhausted" | "resolved" }
```

### Get Statistics
```
GET /api/admin/dlq/stats
```

## Observability Events

The DLQ emits events for monitoring and alerting:

| Event | Description |
|-------|-------------|
| `dlq-item-added` | Job added to DLQ |
| `dlq-retry-start` | Retry attempt started |
| `dlq-retry-success` | Retry succeeded |
| `dlq-retry-failed` | Retry failed |
| `dlq-item-exhausted` | Max retries reached |
| `dlq-item-resolved` | Item marked resolved |

### Example Event Handler

```typescript
const eventHandler = (event: FlowEvent) => {
  switch (event.eventType) {
    case EventType.DlqItemAdded:
      metrics.increment("dlq.items.added");
      alerting.notify(`Job ${event.jobId} added to DLQ: ${event.errorMessage}`);
      break;
    case EventType.DlqItemExhausted:
      metrics.increment("dlq.items.exhausted");
      alerting.critical(`Job ${event.jobId} exhausted all retries`);
      break;
  }
};
```

## Best Practices

### 1. Configure Appropriate Retry Limits
- Use fewer retries (2-3) for validation errors
- Use more retries (5-10) for external service calls
- Consider the total retry duration vs. business requirements

### 2. Filter Non-Retryable Errors
Always configure `nonRetryableErrors` to skip permanent failures:
- `VALIDATION_ERROR` - Invalid input data
- `AUTH_ERROR` - Authentication failures
- `PERMISSION_DENIED` - Authorization failures
- `NOT_FOUND` - Missing resources

### 3. Set Appropriate TTL
- Short TTL (1-2 days) for time-sensitive flows
- Longer TTL (7-30 days) for debugging needs
- Consider storage costs for high-volume systems

### 4. Monitor DLQ Growth
Set up alerts for:
- DLQ size exceeding threshold
- High rate of exhausted items
- Specific error codes appearing frequently

### 5. Regular Cleanup
Schedule periodic cleanup of resolved and exhausted items:

```typescript
// Daily cleanup of items older than 7 days
const dailyCleanup = Effect.gen(function* () {
  const dlq = yield* DeadLetterQueueService;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = yield* dlq.cleanup({ olderThan: weekAgo });
  console.log(`Cleaned up ${result.deleted} DLQ items`);
});
```

## TypeScript Types

### DeadLetterItem

```typescript
interface DeadLetterItem {
  id: string;
  jobId: string;
  flowId: string;
  storageId: string;
  clientId: string | null;
  error: DeadLetterError;
  inputs: Record<string, unknown>;
  nodeResults: Record<string, unknown>;
  failedAtNodeId?: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: Date;
  retryHistory: DeadLetterRetryAttempt[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  status: DeadLetterItemStatus;
}
```

### RetryPolicy

```typescript
interface RetryPolicy {
  enabled: boolean;
  maxRetries: number;
  backoff: BackoffStrategy;
  retryableErrors?: string[];
  nonRetryableErrors?: string[];
  ttlMs?: number;
}

type BackoffStrategy =
  | { type: "immediate" }
  | { type: "fixed"; delayMs: number }
  | { type: "exponential"; initialDelayMs: number; maxDelayMs: number; multiplier: number; jitter: boolean };
```

## Migration Guide

### From v0.x (No DLQ) to v1.x (With DLQ)

1. Add DLQ KV store to your base store configuration
2. Provide the `deadLetterQueueService` layer
3. Optionally configure flow-level retry policies
4. Implement admin UI or CLI for DLQ management

The DLQ integration is fully optional and backward compatible. Flows without explicit DLQ configuration will work as before.
