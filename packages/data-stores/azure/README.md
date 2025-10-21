# @uploadista/data-store-azure

Azure Blob Storage data store for Uploadista - Store files in Microsoft Azure.

Provides cross-platform Azure Blob Storage integration with multiple authentication methods, resumable uploads, and comprehensive error handling. Works in Node.js, browsers, and edge environments.

## Features

- **Cross-Platform** - Node.js, browsers, Cloudflare Workers, Azure Functions
- **Multiple Auth Methods** - SAS URL, OAuth, Connection String, Shared Key
- **Resumable Uploads** - Resume failed transfers without re-uploading
- **Block Management** - Handles Azure's 50K block limit transparently
- **Custom Metadata** - Attach metadata to blobs
- **Full Observability** - Metrics, logging, and distributed tracing
- **TypeScript** - Full type safety with comprehensive JSDoc

## Installation

```bash
npm install @uploadista/data-store-azure @azure/storage-blob @uploadista/core
# or
pnpm add @uploadista/data-store-azure @azure/storage-blob @uploadista/core
```

## Requirements

- Node.js 18+ (for production server)
- Azure Storage Account
- Azure Container
- TypeScript 5.0+ (optional but recommended)

## Quick Start

### 1. Choose Authentication Method

```typescript
// Option 1: SAS URL (recommended for browsers/edge)
import { azureStore } from "@uploadista/data-store-azure";

const store = azureStore({
  deliveryUrl: "https://myaccount.blob.core.windows.net",
  sasUrl: "https://myaccount.blob.core.windows.net?sv=2022-11-02&ss=b&sp=rcwd&se=2024-12-31T23:59:59Z&sig=...",
  containerName: "uploads",
  kvStore: memoryKvStore,
});
```

```typescript
// Option 2: OAuth (recommended for production)
import { DefaultAzureCredential } from "@azure/identity";
import { azureStore } from "@uploadista/data-store-azure";

const credential = new DefaultAzureCredential();

const store = azureStore({
  deliveryUrl: "https://myaccount.blob.core.windows.net",
  accountName: "myaccount",
  credential,
  containerName: "uploads",
  kvStore: memoryKvStore,
});
```

### 2. Configure Azure Credentials

```bash
# Option 1: Environment variables (DefaultAzureCredential)
export AZURE_TENANT_ID=your-tenant-id
export AZURE_CLIENT_ID=your-client-id
export AZURE_CLIENT_SECRET=your-client-secret

# Option 2: Connection string
export AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;"

# Option 3: SAS URL
export AZURE_STORAGE_SAS_URL="https://account.blob.core.windows.net?sv=2022-11-02&..."
```

### 3. Use in Server

```typescript
import { createFastifyUploadistaAdapter } from "@uploadista/adapters-fastify";
import { azureStore } from "@uploadista/data-store-azure";
import { redisKvStore } from "@uploadista/kv-store-redis";

const adapter = await createFastifyUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore: azureStore({
    deliveryUrl: process.env.AZURE_STORAGE_URL!,
    containerName: "uploads",
    credential: new DefaultAzureCredential(),
    accountName: process.env.AZURE_ACCOUNT_NAME!,
    kvStore: redisKvStore,
  }),
  kvStore: redisKvStore,
  flows: createFlowsEffect,
});
```

## Configuration

### `AzureStoreOptions`

```typescript
type AzureStoreOptions = {
  // Required
  deliveryUrl: string;                        // URL for accessing blobs
  containerName: string;                      // Container name
  kvStore: KvStore<UploadFile>;              // Metadata store

  // Block management (optional)
  blockSize?: number;                         // Preferred block size (1B-4000MiB)
  minBlockSize?: number;                      // Minimum block size (default: 1KB)
  maxBlocks?: number;                         // Default: 50,000 (Azure limit)
  maxConcurrentBlockUploads?: number;         // Default: 60
  expirationPeriodInMilliseconds?: number;    // Default: 1 week

  // Authentication - choose one:
  sasUrl?: string;                           // SAS URL (for all environments)
  credential?: TokenCredential;              // OAuth (recommended for production)
  connectionString?: string;                 // Connection string (all environments)
  accountKey?: string;                       // Shared key (Node.js only, deprecated)

  // With OAuth, also specify:
  accountName?: string;                      // Storage account name
};
```

## Authentication Methods

### 1. SAS URL (Best for Browsers/Edge)

```typescript
// Generate SAS URL in Azure Portal or CLI
// Storage Account → Containers → shared access tokens

const store = azureStore({
  deliveryUrl: "https://myaccount.blob.core.windows.net",
  sasUrl: "https://myaccount.blob.core.windows.net?sv=2022-11-02&ss=b&srt=sco&sp=rwdlacupx&se=2024-12-31T23:59:59Z&st=2024-01-01T00:00:00Z&spr=https&sig=...",
  containerName: "uploads",
  kvStore,
});

// Works in:
// ✓ Node.js
// ✓ Browsers
// ✓ Cloudflare Workers
// ✓ Azure Functions
// ✓ Edge environments
```

### 2. OAuth Token Credential (Best for Production)

```typescript
import { DefaultAzureCredential } from "@azure/identity";

// Automatically uses (in order):
// 1. Environment variables (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)
// 2. Managed Identity (if running on Azure VM, App Service, etc.)
// 3. Azure CLI credentials
// 4. Visual Studio Code credentials

const credential = new DefaultAzureCredential();

const store = azureStore({
  deliveryUrl: "https://myaccount.blob.core.windows.net",
  accountName: "myaccount",
  credential,
  containerName: "uploads",
  kvStore,
});

// Works in:
// ✓ Node.js
// ✓ Azure services (VM, App Service, Functions, etc.)
// ✓ With Azure AD integration
```

### 3. Connection String

```typescript
const store = azureStore({
  deliveryUrl: "https://myaccount.blob.core.windows.net",
  connectionString: "DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=your-key;EndpointSuffix=core.windows.net",
  containerName: "uploads",
  kvStore,
});

// Works in:
// ✓ Node.js
// ✓ Browsers (if hosted server-side)
// ✓ Azure Functions
```

### 4. Shared Key (Legacy - Node.js Only)

```typescript
// ⚠️ Deprecated - only for backwards compatibility
// Use OAuth or SAS URL instead

const store = azureStore({
  deliveryUrl: "https://myaccount.blob.core.windows.net",
  accountName: "myaccount",
  accountKey: "your-account-key",
  containerName: "uploads",
  kvStore,
});

// Only works in Node.js
```

## Azure Setup Guide

### 1. Create Storage Account

```bash
# Azure CLI
az storage account create \
  --name myaccount \
  --resource-group my-rg \
  --location eastus \
  --sku Standard_LRS
```

### 2. Create Container

```bash
az storage container create \
  --name uploads \
  --account-name myaccount \
  --auth-mode login
```

### 3. Generate SAS URL

```bash
# Via Azure CLI
az storage container generate-sas \
  --name uploads \
  --account-name myaccount \
  --permissions acdlrw \
  --expiry 2024-12-31T23:59:59Z \
  --https-only

# Returns: sv=2022-11-02&ss=b&srt=sco&sp=rwdlacupx&se=2024-12-31T23:59:59Z&...
```

### 4. Create Service Principal (OAuth)

```bash
# Create service principal
az ad sp create-for-rbac \
  --name uploadista-service \
  --role "Storage Blob Data Contributor" \
  --scopes /subscriptions/YOUR_SUBSCRIPTION_ID/resourceGroups/my-rg/providers/Microsoft.Storage/storageAccounts/myaccount

# Output includes:
# - appId (AZURE_CLIENT_ID)
# - password (AZURE_CLIENT_SECRET)
# - tenant (AZURE_TENANT_ID)
```

### 5. Configure CORS (Optional)

```bash
az storage cors add \
  --services b \
  --methods GET HEAD PUT POST DELETE OPTIONS \
  --origins "https://myapp.com" \
  --allowed-headers "*" \
  --exposed-headers "*" \
  --max-age 3600 \
  --account-name myaccount
```

## Complete Server Example

```typescript
import Fastify from "fastify";
import WebSocket from "@fastify/websocket";
import JwT from "@fastify/jwt";
import { DefaultAzureCredential } from "@azure/identity";
import { createFastifyUploadistaAdapter } from "@uploadista/adapters-fastify";
import { azureStore } from "@uploadista/data-store-azure";
import { redisKvStore } from "@uploadista/kv-store-redis";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";

const fastify = Fastify({ logger: true });

await fastify.register(JwT, { secret: process.env.JWT_SECRET! });
await fastify.register(WebSocket);

// Create Azure store
const credential = new DefaultAzureCredential();

const azureDataStore = azureStore({
  deliveryUrl: process.env.AZURE_STORAGE_URL!,
  accountName: process.env.AZURE_ACCOUNT_NAME!,
  credential,
  containerName: process.env.AZURE_CONTAINER || "uploads",
  kvStore: redisKvStore,
  blockSize: parseInt(process.env.AZURE_BLOCK_SIZE || "4194304"), // 4MB
});

// Create adapter
const adapter = await createFastifyUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore: azureDataStore,
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

## Performance Tuning

### Block Size Strategy

Azure limits uploads to 50,000 blocks. Block size is calculated automatically:

```typescript
// For typical files (<4GB)
const store = azureStore({
  deliveryUrl,
  accountName,
  credential,
  containerName: "uploads",
  kvStore,
  blockSize: 4 * 1024 * 1024,          // 4MB (default)
  maxConcurrentBlockUploads: 10,
});

// For large files (>4GB, up to 200GB)
const largeFileStore = azureStore({
  deliveryUrl,
  accountName,
  credential,
  containerName: "uploads",
  kvStore,
  blockSize: 20 * 1024 * 1024,         // 20MB
  maxConcurrentBlockUploads: 5,
});
```

## Environment Configuration

### .env File

```env
# Azure Configuration
AZURE_STORAGE_URL=https://myaccount.blob.core.windows.net
AZURE_ACCOUNT_NAME=myaccount
AZURE_CONTAINER=uploads
AZURE_BLOCK_SIZE=4194304

# OAuth (DefaultAzureCredential)
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret

# Or Connection String
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...;

# Or SAS URL
AZURE_STORAGE_SAS_URL=https://myaccount.blob.core.windows.net?sv=2022-11-02&...
```

## Cross-Platform Authentication

Use the right auth method for your environment:

| Environment | Recommended | Alternative |
|-------------|------------|--------------|
| Node.js Backend | OAuth (DefaultAzureCredential) | Connection String |
| Browser/SPA | SAS URL | Cannot use OAuth directly |
| Azure VM/App Service | Managed Identity (via DefaultAzureCredential) | OAuth |
| Cloudflare Workers | SAS URL | Connection String |
| Azure Functions | Managed Identity | OAuth |

## Migration from Shared Key

If using deprecated shared key auth:

```typescript
// Old way (deprecated)
const oldStore = azureStore({
  accountName: "myaccount",
  accountKey: "...",
  containerName: "uploads",
  kvStore,
});

// Migrate to OAuth
import { DefaultAzureCredential } from "@azure/identity";

const newStore = azureStore({
  deliveryUrl: "https://myaccount.blob.core.windows.net",
  accountName: "myaccount",
  credential: new DefaultAzureCredential(),
  containerName: "uploads",
  kvStore,
});
```

## Error Handling

Common Azure errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| CONTAINER_NOT_FOUND | Container doesn't exist | Create container via Azure CLI or Portal |
| AUTHENTICATION_FAILED | Invalid credentials | Verify auth method and credentials |
| INVALID_BLOCK_SIZE | Block too large | Azure limit is 4GB per block, max 50K blocks |
| REQUEST_TIMEOUT | Upload timeout | Reduce block size or increase network timeout |
| PAYLOAD_TOO_LARGE | File exceeds limit | Azure Blob max is 200GB (50K × 4MB blocks) |

## Monitoring & Observability

```typescript
// Metrics automatically tracked:
// - azure.upload.started
// - azure.upload.progress
// - azure.upload.completed
// - azure.upload.failed
// - azure.block.uploaded
// - azure.metadata.operations
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

EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### Azure Container Instances

```yaml
apiVersion: 2021-07-01
type: Microsoft.ContainerInstance/containerGroups
name: uploadista-server
properties:
  containers:
  - name: app
    properties:
      image: myregistry.azurecr.io/uploadista:latest
      ports:
      - port: 3000
      environmentVariables:
      - name: AZURE_ACCOUNT_NAME
        value: myaccount
      - name: AZURE_CONTAINER
        value: uploads
      resources:
        requests:
          cpu: 1
          memoryInGb: 2
  osType: Linux
  restartPolicy: Always
```

### Azure App Service

```bash
# Create App Service plan
az appservice plan create \
  --name myplan \
  --resource-group my-rg \
  --sku B2

# Create web app
az webapp create \
  --resource-group my-rg \
  --plan myplan \
  --name uploadista-server \
  --runtime "node|20"

# Configure app settings
az webapp config appsettings set \
  --name uploadista-server \
  --resource-group my-rg \
  --settings AZURE_ACCOUNT_NAME=myaccount AZURE_CONTAINER=uploads
```

## Related Packages

- **[@uploadista/data-store-s3](../s3/)** - AWS S3 storage
- **[@uploadista/data-store-gcs](../gcs/)** - Google Cloud Storage
- **[@uploadista/data-store-filesystem](../filesystem/)** - Local filesystem
- **[@uploadista/server](../../servers/server/)** - Core server utilities
- **[@uploadista/kv-store-redis](../../kv-stores/redis/)** - Redis KV store
- **[@uploadista/core](../../core/)** - Core engine

## TypeScript Support

Full TypeScript support with comprehensive types:

```typescript
import type { AzureStoreOptions } from "@uploadista/data-store-azure";
import { azureStore } from "@uploadista/data-store-azure";
```

## Troubleshooting

### Authentication Failed

```bash
# Check credentials
az account show

# Verify service principal has correct roles
az role assignment list \
  --assignee your-client-id \
  --scope /subscriptions/YOUR_SUBSCRIPTION_ID
```

### Container Not Found

```bash
# List containers
az storage container list \
  --account-name myaccount

# Create if missing
az storage container create \
  --name uploads \
  --account-name myaccount
```

### Slow Uploads

- Reduce block size for network resilience
- Increase `maxConcurrentBlockUploads` for more parallelism
- Check network bandwidth
- Verify storage account replication setting

## License

MIT
