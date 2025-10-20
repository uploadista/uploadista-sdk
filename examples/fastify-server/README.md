# Fastify Server Example

This example demonstrates how to integrate **Uploadista** with a **Fastify** server using the `@uploadista/adapters-fastify` package.

## 🚀 Features

- **Fastify integration** with Uploadista upload and flow server
- **File upload handling** with chunked upload support
- **Flow processing** with image optimization nodes
- **Filesystem KV store** for upload metadata
- **Filesystem data store** for file storage
- **WebSocket support** for real-time upload and flow progress
- **RESTful API** endpoints for upload and flow management
- **Health checks** and server status
- **CORS support** for cross-origin requests

## 📦 Installation

From the project root:

```bash
# Install dependencies
pnpm install

# Navigate to example directory
cd examples/fastify-server

# Install example dependencies
pnpm install
```

## 🏃 Running the Server

### Development Mode

```bash
pnpm run dev
```

This will start the server in development mode with hot reloading on port 3000.

### Production Mode

```bash
# Build the project
pnpm run build

# Start the server
pnpm run start
```

## 🛠️ API Endpoints

### Upload Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/uploadista/api/upload/` | Create new upload session |
| `PATCH` | `/uploadista/api/upload/:id` | Upload file chunks |
| `GET` | `/uploadista/api/upload/:id` | Get upload metadata |

### Flow Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/uploadista/api/flow/` | Execute a flow |
| `GET` | `/uploadista/api/flow/:jobId` | Get flow job status |

### Job Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/uploadista/api/jobs/:jobId/status` | Get job status |
| `PATCH` | `/uploadista/api/jobs/:jobId/continue` | Continue a paused job |

### WebSocket Endpoints

| Endpoint | Description |
|----------|-------------|
| `ws://localhost:3000/uploadista/ws/upload/:uploadId` | Real-time upload progress |
| `ws://localhost:3000/uploadista/ws/flow/:jobId` | Real-time flow job progress |

### Management Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health check |

## 📝 Usage Examples

### Basic Upload Flow

1. **Create Upload Session**
```bash
curl -X POST http://localhost:3000/uploadista/api/upload/ \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test.txt",
    "size": 100,
    "type": "text/plain"
  }'
```

2. **Upload File Content**
```bash
curl -X PATCH http://localhost:3000/uploadista/api/upload/{upload-id} \
  -H "Content-Type: application/octet-stream" \
  --data-binary @test.txt
```

3. **Check Upload Status via WebSocket**
```javascript
const ws = new WebSocket('ws://localhost:3000/uploadista/ws/upload/{upload-id}');
ws.onmessage = (event) => {
  console.log('Upload progress:', event.data);
};
```

### Flow Execution

1. **Execute a Flow**
```bash
curl -X POST http://localhost:3000/uploadista/api/flow/ \
  -H "Content-Type: application/json" \
  -d '{
    "flowId": "optimize-flow",
    "input": {
      "file": "path/to/image.jpg"
    }
  }'
```

2. **Monitor Flow Progress**
```javascript
const ws = new WebSocket('ws://localhost:3000/uploadista/ws/flow/{job-id}');
ws.onmessage = (event) => {
  console.log('Flow progress:', event.data);
};
```

## 🏗️ Implementation Details

### Fastify Adapter Integration

```typescript
import { createFastifyUploadistaAdapter } from '@uploadista/adapters-fastify';

const uploadistaAdapter = await createFastifyUploadistaAdapter({
  dataStore,
  flows,
  plugins: [imageNode],
  kvStore,
});

// Use as route handler
fastify.all('/uploadista/api/*', uploadistaAdapter.handler);

// WebSocket handler
fastify.get('/uploadista/ws/upload/:uploadId', { websocket: true }, (socket, request) => {
  const handlers = uploadistaAdapter.websocketHandler(socket, request);
  socket.on('message', handlers.onMessage);
  socket.on('close', handlers.onClose);
  socket.on('error', handlers.onError);
});
```

### Data Store Configuration

The example uses a filesystem data store:

```typescript
const dataStore = fileStore({
  directory: join(__dirname, '../uploads'),
  deliveryUrl: 'http://localhost:3000/uploads',
});
```

### KV Store Configuration

The example uses a filesystem KV store:

```typescript
const kvStore = fileKvStore({
  directory: join(__dirname, '../uploads'),
});
```

### Flow Configuration

The example includes two flows:

1. **Simple Flow**: Direct upload to storage
2. **Optimize Flow**: Upload → Image optimization → Storage

```typescript
export const flows = (flowId: string) => {
  return flowId === 'optimize-flow' ? optimizeFlow : simpleFlow;
};
```

## 📁 File Structure

```
fastify-server/
├── src/
│   ├── server.ts           # Main Fastify server
│   └── flows.ts            # Flow definitions
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── README.md             # This documentation
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `ALLOWED_ORIGINS` | `*` | Comma-separated list of allowed CORS origins |
| `NODE_ENV` | - | Environment (development/production) |

### Storage Configuration

Files are stored in `uploads/` directory relative to the server location. You can modify the data store configuration in `src/server.ts`:

```typescript
const dataStore = fileStore({
  directory: '/path/to/your/uploads',
  deliveryUrl: 'http://your-domain.com/uploads',
});
```

## 🧪 Testing

### Manual Testing

1. Start the server: `pnpm run dev`
2. Use cURL commands from the examples above
3. Check the `uploads/` directory for uploaded files

### Using cURL

See the API examples above for cURL commands to test each endpoint.

### Using Postman/Insomnia

Import the following requests:

1. **Health Check**: `GET http://localhost:3000/health`
2. **Create Upload**: `POST http://localhost:3000/uploadista/api/upload/` with JSON body
3. **Upload File**: `PATCH http://localhost:3000/uploadista/api/upload/{id}` with binary body
4. **Execute Flow**: `POST http://localhost:3000/uploadista/api/flow/` with JSON body
5. **Get Job Status**: `GET http://localhost:3000/uploadista/api/jobs/{jobId}/status`

## 🚨 Production Considerations

For production deployment, consider:

1. **Database Storage**: Replace file-based KV store with persistent storage (Redis, PostgreSQL, etc.)
2. **Cloud Storage**: Use cloud storage (S3, GCS, etc.) instead of filesystem
3. **Authentication**: Add user authentication and authorization
4. **Rate Limiting**: Implement upload rate limiting with `@fastify/rate-limit`
5. **Error Handling**: Enhanced error handling and logging
6. **Monitoring**: Add metrics and health monitoring
7. **Security**: Validate file types, scan for malware, implement HTTPS
8. **Clustering**: Use Fastify clustering for better performance

## 📚 Related Documentation

- [Uploadista Core Documentation](../../packages/uploadista/core/README.md)
- [Fastify Adapter Documentation](../../packages/uploadista/adapters-fastify/README.md)
- [Data Stores Documentation](../../packages/uploadista/data-stores/)
- [KV Stores Documentation](../../packages/uploadista/kv-stores/)
- [Fastify Documentation](https://www.fastify.io/)

## 🐛 Troubleshooting

### Common Issues

**Server won't start**
- Check if port 3000 is available
- Verify all dependencies are installed
- Check Node.js version (requires Node 18+)

**Upload fails**
- Verify the `uploads/` directory exists and is writable
- Check file permissions
- Ensure storage ID matches server configuration

**WebSocket connection fails**
- Verify WebSocket plugin is registered
- Check for proxy/firewall blocking WebSocket connections
- Ensure upload/job ID is valid

**TypeScript errors**
- Run `pnpm run build` to check for compilation errors
- Verify all workspace dependencies are built

## 🔥 Performance Tips

Fastify is designed for high performance. To maximize throughput:

1. Use clustering with `fastify-cluster`
2. Enable HTTP/2 support
3. Use streaming for large file uploads
4. Configure appropriate body size limits
5. Use connection pooling for database/Redis
6. Enable compression with `@fastify/compress`

## 📝 License

This example is part of the Uploadista project.
