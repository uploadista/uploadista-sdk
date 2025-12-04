# Uploadista SDK

The modern upload and file processing platform for TypeScript. Build powerful file upload and processing pipelines with a modular, type-safe architecture.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-enabled-blueviolet)](https://opentelemetry.io/)

## Features

- **Upload Engine** - upload files to storage with a modular architecture, with support for resumability and parallel uploads.
- **Flow Engine** - Build DAG-based file processing pipelines with nodes for image optimization, AI processing, and storage.
- **Multi-Cloud Storage** - First-class support for S3, Azure Blob, GCS, and local filesystem.
- **Resumable Uploads** - Chunked uploads with automatic resume capability.
- **Real-time Progress** - WebSocket and event-based progress tracking.
- **Framework Agnostic** - Adapters for Hono, Express, Fastify, and more.
- **Client SDKs** - React, Vue, React Native, Expo, and vanilla JavaScript clients.
- **Type Safe** - Full TypeScript support with Effect-TS for composable error handling.
- **Modular Architecture** - Pluggable KV stores, data stores, and event systems.
- **Edge Ready** - Deploy to Cloudflare Workers, AWS Lambda, or traditional servers. (coming soon)

## Quick Start

### Installation

```bash
# Core packages
npm install @uploadista/core @uploadista/server

# Client SDK (choose one)
npm install @uploadista/client-react       # React
npm install @uploadista/client-vue         # Vue 3
npm install @uploadista/client-browser     # Vanilla JS
npm install @uploadista/client-expo        # Expo/React Native

# Server adapter (choose one)
npm install @uploadista/adapters-hono      # Cloudflare Workers/Hono
npm install @uploadista/adapters-express   # Express
npm install @uploadista/adapters-fastify   # Fastify

# Storage backend (choose one or more)
npm install @uploadista/data-store-s3      # AWS S3
npm install @uploadista/data-store-azure   # Azure Blob
npm install @uploadista/data-store-gcs     # Google Cloud Storage
npm install @uploadista/data-store-filesystem  # Local filesystem

# KV store (choose one)
npm install @uploadista/kv-store-redis     # Redis
npm install @uploadista/kv-store-memory    # In-memory (dev)
npm install @uploadista/kv-store-cloudflare-kv  # Cloudflare KV
```

### Basic Server Setup

```typescript
import { createUploadServer } from "@uploadista/server";
import { createS3DataStore } from "@uploadista/data-store-s3";
import { createRedisKVStore } from "@uploadista/kv-store-redis";
import { createHonoAdapter } from "@uploadista/adapters-hono";
import { Effect, Layer } from "effect";

// Configure data store
const dataStore = createS3DataStore({
  bucket: "my-uploads",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Configure KV store
const kvStore = createRedisKVStore({
  url: process.env.REDIS_URL!,
});

// Create upload server
const uploadServer = createUploadServer({
  dataStores: { default: dataStore },
  kvStore,
});

// Create HTTP adapter
const app = createHonoAdapter(uploadServer);

// Start server
export default app;
```

### React Client Example

```tsx
import { UploadistaProvider, useUpload } from "@uploadista/client-react";

function App() {
  return (
    <UploadistaProvider
      baseUrl="https://api.example.com"
      storageId="default"
      chunkSize={5 * 1024 * 1024}
    >
      <UploadForm />
    </UploadistaProvider>
  );
}

function UploadForm() {
  const upload = useUpload({
    onSuccess: (result) => console.log("Upload complete:", result),
    onError: (error) => console.error("Upload failed:", error),
    onProgress: (progress) => console.log(`Progress: ${progress}%`),
  });

  return (
    <div>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.upload(file);
        }}
        disabled={upload.isUploading}
      />
      {upload.isUploading && (
        <progress value={upload.state.progress} max={100} />
      )}
    </div>
  );
}
```

## Architecture

Uploadista SDK is built on a modular, layered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                   Client Applications                       │
│       (React / Vue / React Native / Browser)                │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/WebSocket
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                   API Layer                                 │
│       (Hono / Express / Fastify + Auth)                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│           Upload & Flow Processing                          │
│   (Chunked uploads, Flow Engine, DAG processing)            │
└────┬────────────┬──────────────┬───────────────┬───────────┘
     │            │              │               │
     ↓            ↓              ↓               ↓
┌──────────┐ ┌─────────┐  ┌──────────┐  ┌──────────────┐
│ Storage  │ │KV Store │  │  Events  │  │ Flow Nodes   │
│          │ │         │  │          │  │              │
│ • S3     │ │• Redis  │  │• WS      │  │• Images      │
│ • Azure  │ │• Memory │  │• Emitter │  │• AI          │
│ • GCS    │ │• CF KV  │  │• Pub/Sub │  │• Utilities   │
└──────────┘ └─────────┘  └──────────┘  └──────────────┘
```

### Key Concepts

- **Upload Server** - Core business logic for managing file uploads and lifecycle
- **Flow Engine** - DAG-based processor for building file processing pipelines
- **Data Stores** - Pluggable storage backends (S3, Azure, GCS, filesystem)
- **KV Stores** - State management for upload metadata and flow jobs
- **Event System** - Real-time progress updates via WebSocket or pub/sub
- **Adapters** - Framework-specific HTTP routing (Hono, Express, Fastify)

## Packages

### Client SDKs

| Package | Description | Platform |
|----------------------------------------|---------------------------------------|----------|
| `@uploadista/client-core`              | Core client logic, platform-agnostic  | Universal |
| `@uploadista/client-browser`           | Vanilla JavaScript client             | Web |
| `@uploadista/client-react`             | React hooks (useUpload, useMultiUpload, useFlowUpload) | React |
| `@uploadista/client-vue`               | Vue 3 composables | Vue |
| `@uploadista/client-expo`              | Expo/React Native upload client | Mobile |
| `@uploadista/client-react-native-core` | React Native core utilities | Mobile |

### Server Packages

| Package | Description |
|---------|-------------|
| `@uploadista/core` | Core upload server, flow engine, and types |
| `@uploadista/server` | Server utilities, auth context, and middleware |
| `@uploadista/adapters-hono` | Hono adapter (Cloudflare Workers) |
| `@uploadista/adapters-express` | Express adapter |
| `@uploadista/adapters-fastify` | Fastify adapter |

### Data Stores (File Storage)

| Package | Backend |
|---------|---------|
| `@uploadista/data-store-s3` | AWS S3 / Cloudflare R2 |
| `@uploadista/data-store-azure` | Azure Blob Storage |
| `@uploadista/data-store-gcs` | Google Cloud Storage |
| `@uploadista/data-store-filesystem` | Local filesystem |

### KV Stores (Metadata & State)

| Package | Backend |
|---------|---------|
| `@uploadista/kv-store-redis` | Redis |
| `@uploadista/kv-store-ioredis` | IORedis (clustering support) |
| `@uploadista/kv-store-cloudflare-kv` | Cloudflare KV (edge) |
| `@uploadista/kv-store-cloudflare-do` | Cloudflare Durable Objects |
| `@uploadista/kv-store-memory` | In-memory (development) |
| `@uploadista/kv-store-filesystem` | File-based KV store |

### Flow Nodes (Processing)

| Package | Description |
|---------|-------------|
| `@uploadista/flow-utility-nodes` | Conditional, merge, multiplex, zip nodes |
| `@uploadista/flow-images-nodes` | Image processing nodes |
| `@uploadista/flow-images-sharp` | Sharp-based image processing (Node.js) |
| `@uploadista/flow-images-photon` | Photon-based processing (Edge/WASM) |
| `@uploadista/flow-images-replicate` | AI image processing (Replicate API) |
| `@uploadista/flow-utility-zipjs` | ZIP file creation utilities |

### Event System

| Package                                    | Description                  |
|--------------------------------------------|------------------------------|
| `@uploadista/event-emitter-websocket`      | WebSocket event emitter      |
| `@uploadista/event-emitter-durable-object` | Durable Object event emitter |
| `@uploadista/event-broadcaster-memory`     | In-memory pub/sub            |
| `@uploadista/event-broadcaster-redis`      | Redis pub/sub                |
| `@uploadista/event-broadcaster-ioredis`    | IORedis pub/sub              |

## Flow Processing Example

Build processing pipelines with the Flow Engine:

```typescript
import { createFlow, createInputNode, createStorageNode } from "@uploadista/core";
import { createOptimizeNode, createResizeNode } from "@uploadista/flow-images-nodes";

// Define nodes
const inputNode = createInputNode("input");
const resizeNode = createResizeNode("resize", { width: 1200, height: 1200, fit: "cover" });
const optimizeNode = createOptimizeNode("optimize", { quality: 80, format: "webp" });
const outputNode = createStorageNode("output");

// Create flow
const imageProcessingFlow = createFlow({
  flowId: "image-processing",
  name: "Image Processing Pipeline",
  nodes: {
    input: inputNode,
    resize: resizeNode,
    optimize: optimizeNode,
    output: outputNode,
  },
  edges: [
    { source: "input", target: "resize" },
    { source: "resize", target: "optimize" },
    { source: "optimize", target: "output" },
  ],
});

// Execute flow
const job = await flowServer.executeFlow(
  "image-processing",
  fileId,
  clientId,
  { quality: 85 }
);
```

## Observability

The SDK includes built-in observability support via OpenTelemetry for distributed tracing, metrics, and logging.

### Quick Start

```bash
# Start local observability stack
docker run -p 3000:3000 -p 4317:4317 -p 4318:4318 --rm -it grafana/otel-lgtm

# Set environment variables
export OTEL_SERVICE_NAME=my-upload-service
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

```typescript
import { OtlpNodeSdkLive } from "@uploadista/observability";
import { Effect } from "effect";

// Add observability to your server
const program = createUploadServer({ /* config */ }).pipe(
  Effect.provide(OtlpNodeSdkLive)
);
```

View traces at `http://localhost:3000` (Grafana) - go to Explore > Tempo.

See the [Observability Guide](./docs/observability/README.md) for detailed setup instructions including Grafana Cloud, self-hosted stacks, and configuration options.

## Documentation

- [Observability Guide](./docs/observability/README.md) - Distributed tracing and metrics setup
- [Architecture Guide](./docs/ARCHITECTURE.md) - Complete system architecture and design patterns
- [Server Setup](./docs/SERVER_SETUP.md) - Step-by-step server configuration
- [Client Integration](./docs/CLIENT_INTEGRATION.md) - Frontend integration guide for all platforms
- [Flow Processing](./docs/FLOW_PROCESSING_EXAMPLE.md) - Building processing pipelines
- [Batch Processing](./docs/BATCH_PROCESSING_EXAMPLE.md) - Handling multiple files efficiently
- [KV Stores Comparison](./docs/KV_STORES_COMPARISON.md) - Choosing the right KV store
- [Authentication](./docs/AUTH.md) - Authentication and authorization patterns
- [Roadmap](./docs/ROADMAP.md) - Future features and improvements

## Development

### Prerequisites

- Node.js 24.10.0 or higher
- pnpm 10.19.0 or higher

### Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Watch mode (development)
pnpm dev
```

### Project Structure

```
uploadista-sdk/
├── packages/
│   ├── clients/          # Client SDKs
│   ├── core/             # Core upload & flow engine
│   ├── servers/          # Server adapters
│   ├── data-stores/      # Storage backends
│   ├── kv-stores/        # State management
│   ├── event-emitters/   # Event system
│   ├── event-broadcasters/ # Pub/sub
│   └── flow/             # Flow nodes
├── docs/                 # Documentation
└── examples/             # Example implementations
```

## Examples

Check the `/examples` directory for complete working examples:

- Express + S3 + Redis
- Hono + Cloudflare Workers + KV
- React + Multi-upload
- Vue + Flow processing
- React Native camera upload

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](./LICENSE) file for details.

## Support

- GitHub Issues: [Report bugs or request features](https://github.com/uploadista/uploadista-sdk/issues)
- Documentation: [docs.uploadista.com](https://docs.uploadista.com)
- Discord: [Join our community](https://discord.gg/uploadista)

## Credits

Built with [Effect-TS](https://effect.website) for composable, type-safe file processing.
