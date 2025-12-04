# Observability Configuration Reference

This document describes all configuration options for Uploadista SDK observability.

## Environment Variables

The SDK follows [OpenTelemetry environment variable conventions](https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/) for configuration.

### Endpoint Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base endpoint URL for all signals | `http://localhost:4318` |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Override endpoint for traces only | Uses base endpoint |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | Override endpoint for metrics only | Uses base endpoint |

**Examples:**

```bash
# Local development with Docker
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Grafana Cloud
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-us-central-0.grafana.net/otlp

# Custom collector
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.internal:4318
```

### Authentication

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_EXPORTER_OTLP_HEADERS` | Headers to include in requests | None |

**Format:** `key=value,key2=value2`

**Examples:**

```bash
# Basic authentication
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic dXNlcm5hbWU6cGFzc3dvcmQ="

# Bearer token
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer your-api-token"

# Multiple headers
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic abc123,X-Scope-OrgID=my-org"
```

### Service Identification

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_SERVICE_NAME` | Service name in traces and metrics | `uploadista` |
| `OTEL_RESOURCE_ATTRIBUTES` | Additional resource attributes | None |

**Examples:**

```bash
# Set service name
export OTEL_SERVICE_NAME=my-upload-service

# Add custom attributes for filtering
export OTEL_RESOURCE_ATTRIBUTES="tenant.id=abc123,deployment.environment=production,service.version=1.2.3"
```

### Uploadista-Specific

| Variable | Description | Default |
|----------|-------------|---------|
| `UPLOADISTA_OBSERVABILITY_ENABLED` | Enable/disable observability | `true` |

**Examples:**

```bash
# Disable observability completely
export UPLOADISTA_OBSERVABILITY_ENABLED=false

# Or
export UPLOADISTA_OBSERVABILITY_ENABLED=0
```

## Programmatic Configuration

### OtlpSdkConfig Options

When using `createOtlpNodeSdkLayer()`, `createOtlpWebSdkLayer()`, or `createOtlpWorkersSdkLayer()`:

```typescript
interface OtlpSdkConfig {
  /** Service name for traces. Defaults to OTEL_SERVICE_NAME or "uploadista" */
  serviceName?: string;

  /** Additional resource attributes to include in all spans */
  resourceAttributes?: Record<string, string>;

  /** Maximum queue size for batch processor. Defaults to 512 */
  maxQueueSize?: number;

  /** Maximum export batch size. Defaults to 512 */
  maxExportBatchSize?: number;

  /** Schedule delay in milliseconds. Defaults to 5000 */
  scheduledDelayMillis?: number;

  /** Export timeout in milliseconds. Defaults to 5000 */
  exportTimeoutMillis?: number;
}
```

**Example:**

```typescript
import { createOtlpNodeSdkLayer } from "@uploadista/observability";

const customSdk = createOtlpNodeSdkLayer({
  serviceName: "my-upload-service",
  resourceAttributes: {
    "tenant.id": "abc123",
    "deployment.environment": "production",
  },
  maxQueueSize: 1024,
  scheduledDelayMillis: 1000,  // Flush every 1 second
  exportTimeoutMillis: 10000, // 10 second timeout
});
```

### OtlpExporterConfig Options

When using `createOtlpTraceExporter()` or `createOtlpMetricExporter()` directly:

```typescript
interface OtlpExporterConfig {
  /** Base endpoint URL */
  endpoint?: string;

  /** Headers for authentication */
  headers?: Record<string, string>;

  /** Request timeout in milliseconds. Defaults to 5000 */
  timeoutMillis?: number;
}
```

## Layers Reference

### Console Export (Development)

| Layer | Environment | Description |
|-------|-------------|-------------|
| `NodeSdkLive` | Node.js | Exports spans to console |
| `WebSdkLive` | Browser | Exports spans to console |
| `WorkersSdkLive` | Cloudflare Workers | Exports spans to console |

### OTLP Export (Production)

| Layer | Environment | Description |
|-------|-------------|-------------|
| `OtlpNodeSdkLive` | Node.js | Exports to OTLP endpoint via HTTP |
| `OtlpWebSdkLive` | Browser | Exports to OTLP endpoint via fetch |
| `OtlpWorkersSdkLive` | Cloudflare Workers | Exports to OTLP endpoint via fetch |

### Custom Layers

| Function | Description |
|----------|-------------|
| `createOtlpNodeSdkLayer(config)` | Create customized Node.js OTLP layer |
| `createOtlpWebSdkLayer(config)` | Create customized browser OTLP layer |
| `createOtlpWorkersSdkLayer(config)` | Create customized Workers OTLP layer |

## Graceful Degradation

The SDK is designed to never fail your application due to observability issues:

1. **Export failures are silent** - If the OTLP endpoint is unreachable, spans are dropped without errors
2. **Timeouts don't block** - Export operations have a 5-second timeout by default
3. **Queue limits prevent memory issues** - Maximum 512 spans queued (configurable)
4. **Observability can be disabled** - Set `UPLOADISTA_OBSERVABILITY_ENABLED=false` to skip all instrumentation

## Common Configurations

### Local Development

```bash
# Start local stack
docker run -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm -it grafana/otel-lgtm

# Configure your app
export OTEL_SERVICE_NAME=my-upload-service
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### Grafana Cloud

```bash
export OTEL_SERVICE_NAME=my-upload-service
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-us-central-0.grafana.net/otlp
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic <base64-encoded-instance:token>"
```

### Datadog

```bash
export OTEL_SERVICE_NAME=my-upload-service
export OTEL_EXPORTER_OTLP_ENDPOINT=https://http-intake.logs.datadoghq.com:443
export OTEL_EXPORTER_OTLP_HEADERS="DD-API-KEY=<your-api-key>"
```

### Jaeger (Self-Hosted)

```bash
export OTEL_SERVICE_NAME=my-upload-service
export OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
```

### Testing (Disabled)

```bash
export UPLOADISTA_OBSERVABILITY_ENABLED=false
```
