# @uploadista/data-store-gcs

Google Cloud Storage data store for Uploadista - Store files in Google Cloud.

Provides GCS-based file storage with resumable uploads, cross-platform support (Node.js and browsers), and comprehensive error handling. Supports both legacy Node.js SDK and new REST-based implementation for edge environments.

## Features

- **Cross-Platform** - Works in Node.js, browsers, and edge environments
- **Dual Implementations** - Optimized Node.js and REST-based APIs
- **Resumable Uploads** - Automatic resume on connection failures
- **Streaming Support** - Efficient memory usage with stream-based uploads
- **Full Observability** - Metrics, logging, and distributed tracing
- **Metadata Support** - Attach custom metadata to objects
- **Automatic Retry** - Intelligent retry logic with exponential backoff
- **TypeScript** - Full type safety with comprehensive JSDoc

## Installation

```bash
npm install @uploadista/data-store-gcs @google-cloud/storage @uploadista/core
# or
pnpm add @uploadista/data-store-gcs @google-cloud/storage @uploadista/core
```

## Requirements

- Node.js 18+ (for Node.js implementation)
- Google Cloud project with Cloud Storage bucket
- Service account JSON key or Application Default Credentials
- TypeScript 5.0+ (optional but recommended)

## Quick Start

### 1. Create GCS Data Store (Node.js)

```typescript
import { gcsStoreNodejs } from "@uploadista/data-store-gcs";
import { createUploadServerLayer } from "@uploadista/server";
import { memoryKvStore } from "@uploadista/kv-store-memory";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";

// Create GCS store (Node.js optimized)
const gcsStore = gcsStoreNodejs({
  bucketName: "my-uploads",
  kvStore: memoryKvStore,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

// Use in upload server
const uploadLayer = createUploadServerLayer({
  dataStore: gcsStore,
  kvStore: memoryKvStore,
  eventEmitter: webSocketEventEmitter,
});
```

### 2. Create GCS Data Store (Cross-Platform REST)

```typescript
import { gcsStoreRest } from "@uploadista/data-store-gcs";

// Create GCS store (works in browsers and edge)
const gcsStore = gcsStoreRest({
  bucketName: "my-uploads",
  kvStore: memoryKvStore,
  credentials: JSON.parse(process.env.GCS_CREDENTIALS!),
});

// Works in browsers, Cloudflare Workers, etc.
```

### 3. Configure Google Cloud Credentials

```bash
# Option 1: Service account key file (Node.js)
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Option 2: Application Default Credentials
gcloud auth application-default login

# Option 3: Embed credentials in environment
export GCS_CREDENTIALS='{"type":"service_account","project_id":"...", ...}'
```

## Configuration

### `GCSStoreOptions`

```typescript
type GCSStoreOptions = {
  // Required
  bucketName: string;                         // GCS bucket name
  kvStore: KvStore<UploadFile>;              // Metadata store

  // Authentication - choose one:
  keyFilename?: string;                       // Path to service account JSON key
  credentials?: object;                       // Service account object (for embed)
};
```

### Available Implementations

```typescript
import {
  gcsStore,              // Legacy Node.js (uses @google-cloud/storage)
  gcsStoreNodejs,       // New Node.js (service-based, recommended)
  gcsStoreRest,         // REST-based (cross-platform)
} from "@uploadista/data-store-gcs";

// Recommended: Use service-based implementations
const nodeStore = gcsStoreNodejs(options);      // Node.js optimized
const restStore = gcsStoreRest(options);        // Cross-platform
```

## Google Cloud Setup Guide

### 1. Create GCS Bucket

```bash
gsutil mb -l us-central1 gs://my-uploads-prod
```

### 2. Create Service Account

```bash
# Create service account
gcloud iam service-accounts create uploadista-service \
  --display-name "Uploadista Service"

# Grant Storage admin role
gcloud projects add-iam-policy-binding my-project \
  --member serviceAccount:uploadista-service@my-project.iam.gserviceaccount.com \
  --role roles/storage.admin

# Create and download key
gcloud iam service-accounts keys create key.json \
  --iam-account uploadista-service@my-project.iam.gserviceaccount.com
```

### 3. Configure Bucket Permissions

```bash
# Make bucket public (optional)
gsutil acl ch -u AllUsers:R gs://my-uploads-prod

# Or set via IAM (recommended)
gcloud storage buckets set-iam-policy gs://my-uploads-prod policy.json
```

policy.json:
```json
{
  "bindings": [
    {
      "members": ["serviceAccount:uploadista-service@my-project.iam.gserviceaccount.com"],
      "role": "roles/storage.objectCreator"
    }
  ]
}
```

### 4. Enable APIs

```bash
gcloud services enable storage-api
gcloud services enable storage-component.googleapis.com
```

### 5. Configure CORS (Optional)

```bash
gsutil cors set cors.json gs://my-uploads-prod
```

cors.json:
```json
[
  {
    "origin": ["https://myapp.com"],
    "method": ["GET", "PUT", "POST"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

## Complete Server Example

```typescript
import Fastify from "fastify";
import WebSocket from "@fastify/websocket";
import JwT from "@fastify/jwt";
import { createFastifyUploadistaAdapter } from "@uploadista/adapters-fastify";
import { gcsStoreNodejs } from "@uploadista/data-store-gcs";
import { redisKvStore } from "@uploadista/kv-store-redis";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";

const fastify = Fastify({ logger: true });

await fastify.register(JwT, { secret: process.env.JWT_SECRET! });
await fastify.register(WebSocket);

// Configure GCS (Node.js)
const gcsStore = gcsStoreNodejs({
  bucketName: process.env.GCS_BUCKET!,
  kvStore: redisKvStore,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

// Create adapter
const adapter = await createFastifyUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore: gcsStore,
  kvStore: redisKvStore,
  eventEmitter: webSocketEventEmitter,
  eventBroadcaster: memoryEventBroadcaster,
  flows: createFlowsEffect,
  authMiddleware: async (req, reply) => {
    try {
      await req.jwtVerify();
      return {
        clientId: (req.user as any).sub,
        permissions: ["upload:create"],
      };
    } catch {
      return null;
    }
  },
});

// Routes
fastify.all(`/${adapter.baseUrl}/*`, (req, res) => adapter.handler(req, res));
fastify.get("/ws", { websocket: true }, (socket, req) => {
  adapter.websocketHandler(socket, req);
});

await fastify.listen({ port: 3000 });
```

## Cross-Platform Example (Browsers)

```typescript
import { gcsStoreRest } from "@uploadista/data-store-gcs";

// In browser or edge environment
const gcsStore = gcsStoreRest({
  bucketName: "my-uploads-prod",
  kvStore: memoryKvStore,
  credentials: {
    type: "service_account",
    project_id: "my-project",
    private_key_id: "...",
    private_key: "...",
    client_email: "...",
    client_id: "...",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  },
});

// Works in browsers, Cloudflare Workers, etc.
```

## Performance Tuning

### Node.js Optimization

```typescript
const gcsStore = gcsStoreNodejs({
  bucketName: "my-uploads-prod",
  kvStore: redisKvStore,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  // Node.js SDK handles parallelization automatically
});
```

### REST API Optimization

```typescript
const gcsStore = gcsStoreRest({
  bucketName: "my-uploads-prod",
  kvStore: redisKvStore,
  credentials: require("./service-account-key.json"),
});
```

## Environment Configuration

### .env File

```env
# GCS Configuration
GCS_BUCKET=my-uploads-prod
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Or embed credentials
GCS_CREDENTIALS='{"type":"service_account","project_id":"my-project",...}'
```

### Using Service Account Key Files

```bash
# Download from Google Cloud Console
gcloud iam service-accounts keys create key.json \
  --iam-account=uploadista@my-project.iam.gserviceaccount.com

# Export as environment variable
export GOOGLE_APPLICATION_CREDENTIALS="$(pwd)/key.json"

# Or use directly
const gcsStore = gcsStoreNodejs({
  bucketName: "my-uploads",
  kvStore,
  keyFilename: "./service-account-key.json",
});
```

## Migration from Legacy Implementation

The store provides backward compatibility:

```typescript
import {
  gcsStore,        // Legacy - still works
  gcsStoreNodejs,  // Recommended new Node.js
} from "@uploadista/data-store-gcs";

// Legacy code still works
const legacyStore = gcsStore(options);

// But use new implementation for better features
const modernStore = gcsStoreNodejs(options);
```

## Error Handling

Common GCS errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| PERMISSION_DENIED | Insufficient IAM permissions | Check service account roles |
| NOT_FOUND | Bucket doesn't exist | Verify bucket name and project |
| INVALID_ARGUMENT | Invalid bucket name | Use lowercase, 3-63 chars |
| DEADLINE_EXCEEDED | Upload timeout | Increase timeout, reduce file size |
| UNAUTHENTICATED | Missing credentials | Set GOOGLE_APPLICATION_CREDENTIALS |

## Monitoring & Observability

```typescript
// Metrics automatically tracked:
// - gcs.upload.started
// - gcs.upload.progress
// - gcs.upload.completed
// - gcs.upload.failed
// - gcs.metadata.operations
```

## Deployment Examples

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
COPY service-account-key.json ./key.json

ENV NODE_ENV=production
ENV GOOGLE_APPLICATION_CREDENTIALS=/app/key.json

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### Google Cloud Run

```bash
# Create service account
gcloud iam service-accounts create uploadista

# Grant permissions
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member serviceAccount:uploadista@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/storage.objectAdmin

# Deploy
gcloud run deploy uploadista-server \
  --source . \
  --platform managed \
  --memory 2Gi \
  --service-account uploadista@PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars GCS_BUCKET=my-uploads-prod
```

### Google App Engine

app.yaml:
```yaml
runtime: nodejs20
env: flex

env_variables:
  GCS_BUCKET: "my-uploads-prod"

automatic_scaling:
  min_instances: 1
  max_instances: 10
```

## Related Packages

- **[@uploadista/data-store-s3](../s3/)** - AWS S3 storage
- **[@uploadista/data-store-azure](../azure/)** - Azure Blob Storage
- **[@uploadista/data-store-filesystem](../filesystem/)** - Local filesystem
- **[@uploadista/server](../../servers/server/)** - Core server utilities
- **[@uploadista/kv-store-redis](../../kv-stores/redis/)** - Redis KV store
- **[@uploadista/core](../../core/)** - Core engine

## TypeScript Support

Full TypeScript support with comprehensive types:

```typescript
import type { GCSStoreOptions } from "@uploadista/data-store-gcs";
import { gcsStoreNodejs, gcsStoreRest } from "@uploadista/data-store-gcs";
```

## Troubleshooting

### Permission Denied

```bash
# Check service account permissions
gcloud projects get-iam-policy my-project \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:uploadista@*"

# Grant Storage Object Creator role
gcloud projects add-iam-policy-binding my-project \
  --member serviceAccount:uploadista@my-project.iam.gserviceaccount.com \
  --role roles/storage.objectCreator
```

### Bucket Not Found

```bash
# List buckets
gsutil ls

# Check bucket name spelling
gsutil ls gs://my-uploads-prod/
```

### Slow Uploads

- Use `gcsStoreNodejs` in Node.js (more optimized)
- Check network bandwidth to GCS
- Verify service account has appropriate permissions
- Monitor GCS quota usage

### Authentication Issues

```bash
# Test credentials
gcloud auth activate-service-account \
  --key-file=service-account-key.json

# List buckets with service account
gsutil -i serviceAccount@project.iam.gserviceaccount.com ls
```

## License

MIT
