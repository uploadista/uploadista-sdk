# @uploadista/data-store-s3

AWS S3 data store for Uploadista - Store files in Amazon S3.

Provides S3-based file storage with multipart upload support, intelligent part size optimization, resumable uploads, and comprehensive error handling. Handles S3-specific constraints (10,000 parts limit, 5TB max file size) transparently.

## Features

- **Multipart Uploads** - Configurable part sizes (5MiB to 5GiB)
- **Intelligent Optimization** - Automatic part size calculation for optimal performance
- **Resumable Uploads** - Resume failed uploads without re-uploading
- **File Tags** - Attach metadata tags to S3 objects
- **Expiration Support** - Automatic cleanup of old incomplete uploads
- **Full Observability** - Metrics, logging, and distributed tracing
- **Error Recovery** - Automatic retry with exponential backoff
- **TypeScript** - Full type safety with comprehensive JSDoc

## Installation

```bash
npm install @uploadista/data-store-s3 @aws-sdk/client-s3 @uploadista/core
# or
pnpm add @uploadista/data-store-s3 @aws-sdk/client-s3 @uploadista/core
```

## Requirements

- Node.js 18+
- AWS account with S3 bucket
- AWS credentials (via environment variables, IAM role, or credentials file)
- TypeScript 5.0+ (optional but recommended)

## Quick Start

### 1. Create S3 Data Store

```typescript
import { createS3Store } from "@uploadista/data-store-s3";
import { createUploadServerLayer } from "@uploadista/server";
import { memoryKvStore } from "@uploadista/kv-store-memory";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
import { Effect } from "effect";

// Create S3 store
const s3Store = createS3Store({
  deliveryUrl: "https://my-bucket.s3.amazonaws.com",
  s3ClientConfig: {
    region: "us-east-1",
    bucket: "my-bucket",
  },
  kvStore: memoryKvStore,
});

// Use in upload server
const uploadLayer = createUploadServerLayer({
  dataStore: s3Store,
  kvStore: memoryKvStore,
  eventEmitter: webSocketEventEmitter,
});
```

### 2. Configure AWS Credentials

```bash
# Option 1: Environment variables
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_REGION=us-east-1

# Option 2: AWS credentials file (~/.aws/credentials)
[default]
aws_access_key_id = your-access-key
aws_secret_access_key = your-secret-key

# Option 3: IAM role (when running on EC2, Lambda, ECS, etc.)
# Automatically used - no configuration needed
```

### 3. Upload Files

```typescript
import { createHonoUploadistaAdapter } from "@uploadista/adapters-hono";
import { createFlowsEffect } from "./flows";

const adapter = await createHonoUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore: s3Store,
  kvStore: memoryKvStore,
  flows: createFlowsEffect,
});

// Files now upload to S3 automatically
```

## Configuration

### `S3StoreOptions`

```typescript
type S3StoreOptions = {
  // Required
  deliveryUrl: string;                         // URL for accessing uploaded files
  s3ClientConfig: S3ClientConfig & {
    bucket: string;                           // S3 bucket name
  };
  kvStore: KvStore<UploadFile>;               // Metadata store

  // Optional - Multipart Configuration
  partSize?: number;                          // Preferred part size (5MiB-5GiB)
  minPartSize?: number;                       // Minimum part size (default: 5MiB)
  maxMultipartParts?: number;                 // Default: 10,000 (S3 limit)
  maxConcurrentPartUploads?: number;          // Default: 60

  // Optional - Management
  useTags?: boolean;                          // Add tags to S3 objects
  expirationPeriodInMilliseconds?: number;    // Default: 1 week (7 days)
};
```

### Part Size Strategy

S3 limits uploads to 10,000 parts. The store automatically calculates optimal part size:

```typescript
// For a 5TB file with default 5MiB parts:
// Parts needed = 5TB / 5MiB ≈ 1,048,576 parts
// This exceeds S3's 10K limit, so part size is automatically increased

const s3Store = createS3Store({
  deliveryUrl: "https://bucket.s3.amazonaws.com",
  s3ClientConfig: {
    region: "us-east-1",
    bucket: "my-bucket",
  },
  kvStore: kvStore,

  // For typical files (<100GB), use default 5MiB parts
  // For large files (>100GB), increase part size
  partSize: 100 * 1024 * 1024,  // 100MiB for faster large uploads
  maxConcurrentPartUploads: 10,  // Tune based on network
});
```

### Delivery URL Configuration

The `deliveryUrl` is used to construct file URLs in responses:

```typescript
// For public bucket with CloudFront
const s3Store = createS3Store({
  deliveryUrl: "https://d123456.cloudfront.net",
  // URLs will be: https://d123456.cloudfront.net/upload-123

  s3ClientConfig: {
    region: "us-east-1",
    bucket: "my-uploads",
  },
  kvStore,
});

// For direct S3 access
const s3Store = createS3Store({
  deliveryUrl: "https://my-uploads.s3.amazonaws.com",
  // URLs will be: https://my-uploads.s3.amazonaws.com/upload-123

  s3ClientConfig: {
    region: "us-east-1",
    bucket: "my-uploads",
  },
  kvStore,
});

// For S3 Transfer Acceleration
const s3Store = createS3Store({
  deliveryUrl: "https://my-uploads.s3-accelerate.amazonaws.com",
  s3ClientConfig: {
    region: "us-east-1",
    bucket: "my-uploads",
  },
  kvStore,
});
```

## AWS Setup Guide

### 1. Create S3 Bucket

```bash
aws s3 mb s3://my-uploads-prod --region us-east-1
```

### 2. Configure Bucket Policy (Public Read)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-uploads-prod/*"
    }
  ]
}
```

### 3. Create IAM User for Uploads

```bash
# Create user
aws iam create-user --user-name uploadista-service

# Attach S3 policy
aws iam attach-user-policy \
  --user-name uploadista-service \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

# Create access keys
aws iam create-access-key --user-name uploadista-service
```

### 4. Optional: Enable CORS

```bash
aws s3api put-bucket-cors \
  --bucket my-uploads-prod \
  --cors-configuration '{
    "CORSRules": [
      {
        "AllowedOrigins": ["https://myapp.com"],
        "AllowedMethods": ["PUT", "POST"],
        "AllowedHeaders": ["*"]
      }
    ]
  }'
```

### 5. Optional: Enable Versioning

```bash
aws s3api put-bucket-versioning \
  --bucket my-uploads-prod \
  --versioning-configuration Status=Enabled
```

### 6. Optional: Enable Transfer Acceleration

```bash
aws s3api put-bucket-accelerate-configuration \
  --bucket my-uploads-prod \
  --accelerate-configuration Status=Enabled
```

## Complete Server Example

```typescript
import Fastify from "fastify";
import WebSocket from "@fastify/websocket";
import JwT from "@fastify/jwt";
import { createFastifyUploadistaAdapter } from "@uploadista/adapters-fastify";
import { createS3Store } from "@uploadista/data-store-s3";
import { redisKvStore } from "@uploadista/kv-store-redis";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";

const fastify = Fastify({ logger: true });

await fastify.register(JwT, { secret: process.env.JWT_SECRET! });
await fastify.register(WebSocket);

// Configure S3
const s3Store = createS3Store({
  deliveryUrl: process.env.S3_DELIVERY_URL!,
  s3ClientConfig: {
    region: process.env.AWS_REGION || "us-east-1",
    bucket: process.env.S3_BUCKET!,
  },
  kvStore: redisKvStore,
  partSize: parseInt(process.env.S3_PART_SIZE || "5242880"), // 5MB default
});

// Create adapter
const adapter = await createFastifyUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore: s3Store,
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

// Start
await fastify.listen({ port: 3000 });
console.log("Server running with S3 storage");
```

## Performance Tuning

### For Small Files (<10MB)

```typescript
const s3Store = createS3Store({
  deliveryUrl,
  s3ClientConfig: { region, bucket },
  kvStore,
  partSize: 5 * 1024 * 1024,           // 5MB (minimum)
  maxConcurrentPartUploads: 20,        // Higher concurrency
});
```

### For Medium Files (10MB - 1GB)

```typescript
const s3Store = createS3Store({
  deliveryUrl,
  s3ClientConfig: { region, bucket },
  kvStore,
  partSize: 10 * 1024 * 1024,          // 10MB
  maxConcurrentPartUploads: 10,
});
```

### For Large Files (>1GB)

```typescript
const s3Store = createS3Store({
  deliveryUrl,
  s3ClientConfig: { region, bucket },
  kvStore,
  partSize: 100 * 1024 * 1024,         // 100MB
  maxConcurrentPartUploads: 5,         // Lower concurrency for stability
});
```

### For Edge Locations (Using Transfer Acceleration)

```typescript
const s3Store = createS3Store({
  deliveryUrl: "https://bucket.s3-accelerate.amazonaws.com",
  s3ClientConfig: {
    region: "us-east-1",
    bucket: "my-bucket",
    useAccelerateEndpoint: true,
  },
  kvStore,
});
```

## Environment Configuration

### .env File

```env
# AWS Configuration
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1

# S3 Configuration
S3_BUCKET=my-uploads-prod
S3_DELIVERY_URL=https://my-uploads.s3.amazonaws.com
S3_PART_SIZE=5242880

# Optional: Transfer Acceleration
S3_USE_ACCELERATE=true

# Optional: Tags
S3_USE_TAGS=true
```

### programmatic Configuration

```typescript
import { createS3Store } from "@uploadista/data-store-s3";
import { S3Client } from "@aws-sdk/client-s3";

// Advanced S3 client configuration
const customS3Store = createS3Store({
  deliveryUrl: process.env.S3_DELIVERY_URL!,
  s3ClientConfig: {
    region: process.env.AWS_REGION!,
    bucket: process.env.S3_BUCKET!,

    // Optional: Advanced S3 client options
    maxAttempts: 5,
    requestHandler: {
      httpsAgent: new https.Agent({
        keepAlive: true,
        timeout: 30000,
      }),
    },
  },
  kvStore,
  partSize: 50 * 1024 * 1024, // 50MB
});
```

## Error Handling

Common S3 errors and their causes:

| Error | Cause | Solution |
|-------|-------|----------|
| NoSuchBucket | Bucket doesn't exist | Verify bucket name and region |
| AccessDenied | Insufficient IAM permissions | Check IAM policy for PutObject, GetObject |
| InvalidBucketName | Invalid bucket name | Use lowercase, 3-63 chars, no special chars |
| EntityTooLarge | File exceeds S3 limits | Max 5TB per file |
| InvalidPartOrder | Parts uploaded out of order | Upload parts sequentially |
| NoSuchUpload | Multipart upload doesn't exist | Session expired - restart upload |

## Monitoring & Observability

S3 store includes built-in observability:

```typescript
import { MetricsClient } from "@uploadista/observability";

// Metrics automatically tracked:
// - s3.upload.started
// - s3.upload.progress
// - s3.upload.completed
// - s3.upload.failed
// - s3.part.uploaded
// - s3.metadata.operations
```

## CloudFront Integration (Optional)

For better performance, distribute files through CloudFront:

```typescript
// Create CloudFront distribution pointing to S3 bucket
const s3Store = createS3Store({
  deliveryUrl: "https://d123456789.cloudfront.net", // CloudFront URL
  s3ClientConfig: {
    region: "us-east-1",
    bucket: "my-bucket",
  },
  kvStore,
});

// Files are now served through CloudFront edge locations globally
```

## Deployment Examples

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist

ENV NODE_ENV=production
ENV AWS_REGION=us-east-1

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### AWS Lambda (with Serverless Framework)

```yaml
service: uploadista-s3-server

provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1
  environment:
    S3_BUCKET: my-uploads-prod

functions:
  api:
    handler: dist/handler.default
    events:
      - http:
          path: /{proxy+}
          method: ANY
    timeout: 300
    memorySize: 2048

  websocket:
    handler: dist/websocket.default
    events:
      - websocket:
          route: $default

resources:
  Resources:
    UploadsBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: my-uploads-prod
```

### Heroku

```bash
# Create and configure app
heroku create my-uploadista-s3
heroku addons:create heroku-postgresql:standard-0
heroku config:set AWS_ACCESS_KEY_ID=your-key
heroku config:set AWS_SECRET_ACCESS_KEY=your-secret
heroku config:set S3_BUCKET=my-uploads-prod

# Deploy
git push heroku main
```

## Related Packages

- **[@uploadista/data-store-azure](../azure/)** - Azure Blob Storage
- **[@uploadista/data-store-gcs](../gcs/)** - Google Cloud Storage
- **[@uploadista/data-store-filesystem](../filesystem/)** - Local filesystem
- **[@uploadista/server](../../servers/server/)** - Core server utilities
- **[@uploadista/kv-store-redis](../../kv-stores/redis/)** - Redis KV store
- **[@uploadista/core](../../core/)** - Core engine

## TypeScript Support

Full TypeScript support with comprehensive types:

```typescript
import type { S3StoreOptions, S3Store } from "@uploadista/data-store-s3";
import { createS3Store } from "@uploadista/data-store-s3";
```

## Troubleshooting

### NoSuchBucket Error

```bash
# Verify bucket exists in correct region
aws s3 ls --region us-east-1 | grep my-bucket

# Create bucket if missing
aws s3 mb s3://my-bucket --region us-east-1
```

### AccessDenied Errors

```bash
# Check IAM permissions
aws iam get-user-policy --user-name uploadista-service --policy-name ...

# Grant S3 permissions
aws iam attach-user-policy \
  --user-name uploadista-service \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
```

### Slow Uploads

- Increase `partSize` for faster processing
- Reduce `maxConcurrentPartUploads` if network unstable
- Enable Transfer Acceleration for edge clients
- Use larger chunk sizes in client

### Memory Issues

- Reduce `maxConcurrentPartUploads`
- Decrease `partSize`
- Increase server memory allocation

## License

MIT
