# Grafana Setup Guide

This guide covers setting up Grafana for visualizing Uploadista SDK traces and metrics.

## Option 1: Local Development (Docker)

The fastest way to get started is using Grafana's all-in-one LGTM image:

```bash
docker run -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm -it grafana/otel-lgtm
```

This starts:
- **Grafana** at `http://localhost:3000` (user: admin, no password required)
- **Tempo** for traces
- **Mimir** for metrics
- **Loki** for logs
- **OTLP receiver** on ports 4317 (gRPC) and 4318 (HTTP)

### Viewing Traces

1. Open `http://localhost:3000`
2. Click **Explore** (compass icon) in the left sidebar
3. Select **Tempo** from the data source dropdown
4. Use "Search" tab to find traces:
   - Filter by service name: `uploadista`
   - Filter by span name: `s3-upload-part`, `upload-create`, etc.
5. Click on a trace to see the waterfall view

### Viewing Metrics

1. Go to **Explore**
2. Select **Mimir** or **Prometheus** as data source
3. Query metrics like:
   - `s3_upload_requests_total`
   - `s3_upload_duration_seconds`
   - `upload_chunks_total`

## Option 2: Grafana Cloud

Grafana Cloud provides a managed observability platform with a generous free tier.

### Step 1: Create Account

1. Go to [grafana.com/products/cloud](https://grafana.com/products/cloud/)
2. Sign up for a free account
3. Create a new stack (or use the default one)

### Step 2: Get OTLP Endpoint

1. In your Grafana Cloud stack, go to **Connections** > **Add new connection**
2. Search for "OpenTelemetry (OTLP)"
3. Click "Configure" and note:
   - **OTLP Endpoint**: `https://otlp-gateway-prod-<region>.grafana.net/otlp`
   - **Instance ID**: Your instance number
   - **API Token**: Generate one with "MetricsPublisher" and "TracesPublisher" scopes

### Step 3: Configure Environment Variables

```bash
# Set your OTLP endpoint (replace <region> with your region)
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-us-central-0.grafana.net/otlp

# Set authentication header
# Format: Basic <base64(instance_id:api_token)>
# Generate with: echo -n "123456:your-api-token" | base64
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic MTIzNDU2OnlvdXItYXBpLXRva2Vu"

# Set your service name
export OTEL_SERVICE_NAME=my-upload-service
```

### Step 4: Configure Your Application

```typescript
import { OtlpNodeSdkLive } from "@uploadista/observability";
import { Effect } from "effect";

const program = myUploadEffect.pipe(Effect.provide(OtlpNodeSdkLive));

Effect.runPromise(program);
```

### Step 5: View in Grafana Cloud

1. Go to your Grafana Cloud instance
2. Navigate to **Explore**
3. Select your Tempo data source
4. Search for traces by service name

## Option 3: Self-Hosted Grafana Stack

For production self-hosted deployments, use Docker Compose:

### docker-compose.yml

```yaml
version: '3.8'

services:
  # OpenTelemetry Collector
  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./otel-collector-config.yaml:/etc/otel-collector-config.yaml
    ports:
      - "4317:4317"   # OTLP gRPC
      - "4318:4318"   # OTLP HTTP

  # Tempo for traces
  tempo:
    image: grafana/tempo:latest
    command: ["-config.file=/etc/tempo.yaml"]
    volumes:
      - ./tempo.yaml:/etc/tempo.yaml
      - tempo-data:/tmp/tempo
    ports:
      - "3200:3200"   # Tempo API

  # Prometheus for metrics
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yaml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"

  # Grafana for visualization
  grafana:
    image: grafana/grafana:latest
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana-datasources.yaml:/etc/grafana/provisioning/datasources/datasources.yaml
    ports:
      - "3000:3000"

volumes:
  tempo-data:
  prometheus-data:
  grafana-data:
```

### otel-collector-config.yaml

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 5s
    send_batch_size: 1000

exporters:
  otlp/tempo:
    endpoint: tempo:4317
    tls:
      insecure: true

  prometheus:
    endpoint: "0.0.0.0:8889"

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/tempo]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus]
```

### tempo.yaml

```yaml
server:
  http_listen_port: 3200

distributor:
  receivers:
    otlp:
      protocols:
        grpc:

storage:
  trace:
    backend: local
    local:
      path: /tmp/tempo/blocks
```

### prometheus.yaml

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'otel-collector'
    static_configs:
      - targets: ['otel-collector:8889']
```

### grafana-datasources.yaml

```yaml
apiVersion: 1

datasources:
  - name: Tempo
    type: tempo
    access: proxy
    url: http://tempo:3200
    isDefault: true

  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
```

### Start the Stack

```bash
docker-compose up -d
```

Then configure your application:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_SERVICE_NAME=my-upload-service
```

## Creating Dashboards

### Useful Queries for Tempo (Traces)

```
# Find all upload operations
{resource.service.name="uploadista"} | name =~ "upload.*"

# Find slow uploads (> 5 seconds)
{resource.service.name="uploadista"} | duration > 5s

# Find failed operations
{resource.service.name="uploadista"} | status = error
```

### Useful Queries for Prometheus (Metrics)

```promql
# Upload request rate
rate(s3_upload_requests_total[5m])

# Average upload duration
rate(s3_upload_duration_seconds_sum[5m]) / rate(s3_upload_duration_seconds_count[5m])

# Active uploads
s3_active_uploads

# Error rate
rate(s3_upload_errors_total[5m]) / rate(s3_upload_requests_total[5m])

# Upload throughput (bytes/second)
rate(s3_file_size_bytes_sum[5m])
```

## Alerting

### Example Alert Rules

Create alerts in Grafana for common issues:

**High Error Rate**
```yaml
alert: HighUploadErrorRate
expr: rate(s3_upload_errors_total[5m]) / rate(s3_upload_requests_total[5m]) > 0.05
for: 5m
labels:
  severity: warning
annotations:
  summary: Upload error rate above 5%
```

**Slow Uploads**
```yaml
alert: SlowUploads
expr: histogram_quantile(0.95, rate(s3_upload_duration_seconds_bucket[5m])) > 10
for: 5m
labels:
  severity: warning
annotations:
  summary: 95th percentile upload duration above 10 seconds
```
