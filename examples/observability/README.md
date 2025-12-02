# Observability Examples

This directory contains examples for setting up observability with the Uploadista SDK.

## Quick Start (Simplest)

Use the single-container Grafana LGTM image:

```bash
# Start observability backend
docker run -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm -it grafana/otel-lgtm

# In another terminal, run the example
export OTEL_SERVICE_NAME=uploadista-example
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
npx tsx basic-example.ts

# View traces at http://localhost:3000
```

## Full Stack (Docker Compose)

For more control, use the full docker-compose setup:

```bash
# Start the stack
docker-compose up -d

# Configure your app
export OTEL_SERVICE_NAME=my-upload-service
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Run your app or the example
npx tsx basic-example.ts

# View traces at http://localhost:3000
# View metrics at http://localhost:9090 (Prometheus)

# Stop the stack
docker-compose down
```

## Files in This Directory

| File | Description |
|------|-------------|
| `basic-example.ts` | Simple example showing OTLP tracing |
| `docker-compose.yml` | Full observability stack |
| `otel-collector-config.yaml` | OpenTelemetry Collector configuration |
| `tempo.yaml` | Tempo (tracing backend) configuration |
| `prometheus.yaml` | Prometheus (metrics) configuration |
| `grafana-datasources.yaml` | Pre-configured Grafana data sources |

## Viewing Traces

1. Open Grafana at http://localhost:3000
2. Click **Explore** (compass icon in sidebar)
3. Select **Tempo** as data source
4. Use Search tab:
   - Service Name: `uploadista-example`
   - Span Name: `upload-file` or `batch-upload`
5. Click a trace to see the waterfall view

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `OTEL_SERVICE_NAME` | Service name in traces | `my-upload-service` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint | `http://localhost:4318` |
| `OTEL_EXPORTER_OTLP_HEADERS` | Auth headers | `Authorization=Basic abc` |
| `UPLOADISTA_OBSERVABILITY_ENABLED` | Enable/disable | `true` |

## Troubleshooting

**No traces appearing?**
- Check that docker container is running: `docker ps`
- Verify endpoint: `curl http://localhost:4318/v1/traces`
- Check service name filter in Grafana

**Connection refused?**
- Make sure `docker run` or `docker-compose up` succeeded
- Check ports are not in use: `lsof -i :4318`

See the [full troubleshooting guide](../../docs/observability/troubleshooting.md) for more help.
