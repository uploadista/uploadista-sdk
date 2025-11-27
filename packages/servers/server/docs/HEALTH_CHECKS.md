# Health Check Endpoints

Uploadista SDK provides production-ready health check endpoints for Kubernetes deployments, load balancer health checks, and operational monitoring.

## Endpoints

All health endpoints are available at `/{baseUrl}/` (not under `/api/`):

| Endpoint | Aliases | Purpose | HTTP Status |
|----------|---------|---------|-------------|
| `/health` | `/healthz` | Liveness probe - is the server alive? | Always 200 |
| `/ready` | `/readyz` | Readiness probe - can the server accept traffic? | 200 or 503 |
| `/health/components` | - | Detailed component status for debugging | Always 200 |

## Liveness Probe (`/health`)

The liveness endpoint returns immediately without checking dependencies. Use this for Kubernetes liveness probes to detect if the server process is stuck.

**Request:**
```http
GET /uploadista/health
Accept: application/json
```

**Response (JSON):**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600000,
  "version": "1.2.3"
}
```

**Response (Plain Text):**
```http
GET /uploadista/health
Accept: text/plain

OK
```

## Readiness Probe (`/ready`)

The readiness endpoint checks all critical dependencies before accepting traffic. Use this for Kubernetes readiness probes to prevent traffic from being routed to unhealthy instances.

**Request:**
```http
GET /uploadista/ready
Accept: application/json
```

**Response (Healthy):**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600000,
  "components": {
    "storage": {
      "status": "healthy",
      "latency": 15,
      "message": "Storage backend configured",
      "lastCheck": "2024-01-15T10:30:00.000Z"
    },
    "kvStore": {
      "status": "healthy",
      "latency": 5,
      "message": "KV store configured",
      "lastCheck": "2024-01-15T10:30:00.000Z"
    },
    "eventBroadcaster": {
      "status": "healthy",
      "latency": 2,
      "message": "Event broadcaster configured",
      "lastCheck": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Response (Unhealthy - HTTP 503):**
```json
{
  "status": "unhealthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "components": {
    "storage": {
      "status": "unhealthy",
      "latency": 5000,
      "message": "Connection timeout",
      "lastCheck": "2024-01-15T10:30:00.000Z"
    },
    "kvStore": {
      "status": "healthy",
      "latency": 5,
      "message": "KV store configured",
      "lastCheck": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

## Component Details (`/health/components`)

The components endpoint returns detailed health information including circuit breaker and dead letter queue status. Always returns HTTP 200 for debugging purposes.

**Request:**
```http
GET /uploadista/health/components
Accept: application/json
```

**Response:**
```json
{
  "status": "degraded",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600000,
  "version": "1.2.3",
  "components": {
    "storage": {
      "status": "healthy",
      "latency": 15,
      "message": "Storage backend configured",
      "lastCheck": "2024-01-15T10:30:00.000Z"
    },
    "kvStore": {
      "status": "healthy",
      "latency": 5,
      "message": "KV store configured",
      "lastCheck": "2024-01-15T10:30:00.000Z"
    },
    "eventBroadcaster": {
      "status": "healthy",
      "latency": 2,
      "message": "Event broadcaster configured",
      "lastCheck": "2024-01-15T10:30:00.000Z"
    },
    "circuitBreaker": {
      "status": "degraded",
      "openCircuits": 1,
      "totalCircuits": 5,
      "circuits": [
        {
          "nodeType": "image-resize",
          "state": "open",
          "failureCount": 10,
          "timeSinceLastStateChange": 30000
        }
      ]
    },
    "deadLetterQueue": {
      "status": "healthy",
      "pendingItems": 3,
      "exhaustedItems": 0,
      "oldestItem": "2024-01-15T10:25:00.000Z"
    }
  }
}
```

## Configuration

Configure health check behavior in your server configuration:

```typescript
import { createUploadistaServer } from "@uploadista/server";

const server = await createUploadistaServer({
  // ... other config ...

  healthCheck: {
    // Timeout for dependency checks (default: 5000ms)
    timeout: 3000,

    // Enable/disable specific checks
    checkStorage: true,
    checkKvStore: true,
    checkEventBroadcaster: true,

    // Optional version string for deployment identification
    version: "1.2.3"
  }
});
```

## Kubernetes Deployment Example

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: uploadista-server
spec:
  template:
    spec:
      containers:
        - name: uploadista
          image: your-image:latest
          ports:
            - containerPort: 8080
          livenessProbe:
            httpGet:
              path: /uploadista/health
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 1
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /uploadista/ready
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
            timeoutSeconds: 5
            failureThreshold: 3
```

## Health Status Values

| Status | Description |
|--------|-------------|
| `healthy` | All checks passed, system is fully operational |
| `degraded` | Some non-critical issues detected (e.g., open circuits, DLQ items), but system is functional |
| `unhealthy` | Critical components unavailable, system cannot serve requests |

## Response Formats

Health endpoints support content negotiation via the `Accept` header:

| Accept Header | Response Format |
|--------------|-----------------|
| `application/json` (default) | Full JSON response with status and details |
| `text/plain` | Simple text: "OK" or "Service Unavailable" |

## Integration with Existing Monitoring

### Circuit Breaker Integration

When circuit breakers are enabled, the `/health/components` endpoint includes:
- Count of open circuits
- Total number of circuits
- Individual circuit states and failure counts

Status becomes `degraded` when any circuit is open.

### Dead Letter Queue Integration

When DLQ is enabled, the `/health/components` endpoint includes:
- Count of pending items awaiting retry
- Count of exhausted items (exceeded max retries)
- Timestamp of oldest item in queue

Status becomes `degraded` when there are exhausted items.
