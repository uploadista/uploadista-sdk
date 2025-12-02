# Troubleshooting Observability

Common issues and solutions when setting up Uploadista SDK observability.

## No Traces Appearing

### Check 1: Is the OTLP Layer Provided?

Make sure you're using an OTLP layer, not the console layer:

```typescript
// WRONG - This only logs to console
import { NodeSdkLive } from "@uploadista/observability";
program.pipe(Effect.provide(NodeSdkLive));

// CORRECT - This exports to OTLP endpoint
import { OtlpNodeSdkLive } from "@uploadista/observability";
program.pipe(Effect.provide(OtlpNodeSdkLive));
```

### Check 2: Is the Endpoint Correct?

Verify your endpoint configuration:

```bash
# Check your env var
echo $OTEL_EXPORTER_OTLP_ENDPOINT

# Should be something like:
# - http://localhost:4318 (local)
# - https://otlp-gateway-prod-us-central-0.grafana.net/otlp (Grafana Cloud)
```

### Check 3: Is the Collector Running?

For local development:

```bash
# Check if the container is running
docker ps | grep otel-lgtm

# If not, start it
docker run -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm -it grafana/otel-lgtm
```

### Check 4: Is Observability Enabled?

```bash
# Make sure this is NOT set to false
echo $UPLOADISTA_OBSERVABILITY_ENABLED

# If it's "false" or "0", unset it
unset UPLOADISTA_OBSERVABILITY_ENABLED
```

## Connection Refused Errors

### Symptom
```
Error: connect ECONNREFUSED 127.0.0.1:4318
```

### Solution
The OTLP collector is not running. Start it:

```bash
# Quick start with Docker
docker run -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm -it grafana/otel-lgtm
```

Or check if your collector is running on a different host/port.

## Authentication Failed

### Symptom
Traces are not appearing and you see 401/403 errors in logs.

### Solution 1: Check Header Format

The `OTEL_EXPORTER_OTLP_HEADERS` format is `key=value,key2=value2`:

```bash
# WRONG
export OTEL_EXPORTER_OTLP_HEADERS="Authorization: Basic abc123"

# CORRECT (use = not :)
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic abc123"
```

### Solution 2: Check Base64 Encoding (Grafana Cloud)

For Grafana Cloud, the header should be:
```
Authorization=Basic <base64(instance_id:api_token)>
```

Generate the correct value:
```bash
# Replace with your actual instance ID and token
echo -n "123456:glc_your_api_token_here" | base64
```

### Solution 3: Verify API Token Permissions

Make sure your token has the correct permissions:
- `metrics:write` or `MetricsPublisher`
- `traces:write` or `TracesPublisher`

## Traces Appearing but Missing Spans

### Symptom
You see some traces but not all expected spans (e.g., missing `s3-upload-part`).

### Possible Causes

1. **Spans not instrumented**: The operation might not have tracing added yet. Check if your code uses `Effect.withSpan()`.

2. **Effect not awaited**: Make sure you're running the Effect properly:
```typescript
// WRONG - Effect not executed
const program = myEffect.pipe(Effect.provide(OtlpNodeSdkLive));

// CORRECT - Effect executed
await Effect.runPromise(program.pipe(Effect.provide(OtlpNodeSdkLive)));
```

3. **Layer not provided to all effects**: The layer must be provided to the entire program:
```typescript
// WRONG - Layer only on inner effect
const inner = someEffect.pipe(Effect.provide(OtlpNodeSdkLive));
const outer = Effect.all([inner, otherEffect]); // otherEffect not traced

// CORRECT - Layer on outer effect
const program = Effect.all([someEffect, otherEffect]).pipe(
  Effect.provide(OtlpNodeSdkLive)
);
```

## Performance Impact

### Symptom
Application seems slower with observability enabled.

### Solutions

1. **Reduce batch frequency**:
```typescript
const customSdk = createOtlpNodeSdkLayer({
  scheduledDelayMillis: 10000, // Batch every 10 seconds instead of 5
});
```

2. **Reduce queue size**:
```typescript
const customSdk = createOtlpNodeSdkLayer({
  maxQueueSize: 256, // Smaller queue
});
```

3. **Disable for specific operations**: Don't provide the layer for performance-critical paths.

4. **Use sampling** (requires custom setup):
```bash
export OTEL_TRACES_SAMPLER=traceidratio
export OTEL_TRACES_SAMPLER_ARG=0.1  # Sample 10% of traces
```

## Debugging Tips

### Enable Debug Logging

Add this to your application to see OTLP export activity:

```typescript
import { Effect } from "effect";

// Run with debug logging
const program = myEffect.pipe(
  Effect.withLogSpan("my-operation"),
  Effect.provide(OtlpNodeSdkLive)
);
```

### Check Network Connectivity

```bash
# Test OTLP endpoint is reachable
curl -v http://localhost:4318/v1/traces

# For Grafana Cloud
curl -v -H "Authorization: Basic <your-token>" \
  https://otlp-gateway-prod-us-central-0.grafana.net/otlp/v1/traces
```

### Verify Spans in Console First

Switch to console export temporarily to verify spans are being created:

```typescript
import { NodeSdkLive } from "@uploadista/observability";

// This will log spans to console
const program = myEffect.pipe(Effect.provide(NodeSdkLive));
```

### Check Grafana Tempo Directly

If using Grafana, query Tempo directly:

1. Go to **Explore**
2. Select **Tempo**
3. Switch to "Search" tab
4. Set time range to "Last 15 minutes"
5. Add filter: `resource.service.name = uploadista`

## Getting Help

If you're still having issues:

1. Check that your OpenTelemetry SDK versions are compatible
2. Review the [OpenTelemetry troubleshooting guide](https://opentelemetry.io/docs/collector/troubleshooting/)
3. Open an issue on the [Uploadista SDK repository](https://github.com/uploadista/uploadista-sdk/issues) with:
   - Your environment (Node version, runtime)
   - Configuration (sanitized)
   - Error messages
   - Steps to reproduce
