# Uploadista SDK Observability

The Uploadista SDK includes comprehensive observability support built on [OpenTelemetry](https://opentelemetry.io/) and [Effect](https://effect.website/). This guide will help you set up tracing, metrics, and logging for your upload and flow pipelines.

## Quick Start (5 minutes)

### 1. Start a Local Observability Stack

Run the Grafana LGTM (Loki, Grafana, Tempo, Mimir) stack with a single command:

```bash
docker run -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm -it grafana/otel-lgtm
```

This starts:
- **Grafana** at `http://localhost:3000` (dashboards and visualization)
- **Tempo** for distributed traces
- **OTLP receiver** at `localhost:4318` (HTTP) and `localhost:4317` (gRPC)

### 2. Configure Your Application

```typescript
import { OtlpNodeSdkLive } from "@uploadista/observability";
import { Effect } from "effect";

// Your upload/flow program
const program = Effect.gen(function* () {
  // ... your code with Effect.withSpan, metrics, etc.
});

// Run with OTLP export enabled
Effect.runPromise(
  program.pipe(Effect.provide(OtlpNodeSdkLive))
);
```

### 3. Set Environment Variables

```bash
export OTEL_SERVICE_NAME=my-upload-service
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### 4. View Traces in Grafana

1. Open `http://localhost:3000` in your browser
2. Go to **Explore** (compass icon in left sidebar)
3. Select **Tempo** as the data source
4. Search for traces by service name or trace ID

## Available Layers

The SDK provides different layers for different environments and use cases:

### Console Export (Development)

```typescript
import { NodeSdkLive, WebSdkLive, WorkersSdkLive } from "@uploadista/observability";

// Node.js - exports to console
program.pipe(Effect.provide(NodeSdkLive));

// Browser - exports to console
program.pipe(Effect.provide(WebSdkLive));

// Cloudflare Workers - exports to console
program.pipe(Effect.provide(WorkersSdkLive));
```

### OTLP Export (Production)

```typescript
import { OtlpNodeSdkLive, OtlpWebSdkLive, OtlpWorkersSdkLive } from "@uploadista/observability";

// Node.js - exports to OTLP endpoint
program.pipe(Effect.provide(OtlpNodeSdkLive));

// Browser - exports to OTLP endpoint
program.pipe(Effect.provide(OtlpWebSdkLive));

// Cloudflare Workers - exports to OTLP endpoint
program.pipe(Effect.provide(OtlpWorkersSdkLive));
```

### Custom Configuration

```typescript
import { createOtlpNodeSdkLayer } from "@uploadista/observability";

const customSdk = createOtlpNodeSdkLayer({
  serviceName: "my-custom-service",
  resourceAttributes: {
    "tenant.id": "abc123",
    "deployment.environment": "production",
  },
  maxQueueSize: 1024,
  scheduledDelayMillis: 1000,
});

program.pipe(Effect.provide(customSdk));
```

## What Gets Traced

The SDK automatically creates spans for:

- **Upload operations**: `upload-create`, `upload-chunk`, `upload-write-to-store`
- **Flow execution**: `flow-execute`, `flow-node-*`
- **Storage operations**: `s3-upload-part`, `azure-upload-block`, `gcs-upload-resumable`, etc.

Each span includes relevant attributes like upload IDs, file sizes, storage buckets, and timing information.

## Documentation

- [Configuration Reference](./configuration.md) - All environment variables and options
- [Grafana Setup Guide](./grafana-setup.md) - Detailed setup for Grafana Cloud and self-hosted
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions

## Disabling Observability

To completely disable observability (useful for testing):

```bash
export UPLOADISTA_OBSERVABILITY_ENABLED=false
```

Or use the console-only layers that don't export externally:

```typescript
import { NodeSdkLive } from "@uploadista/observability";
// This only logs to console, no external export
```
