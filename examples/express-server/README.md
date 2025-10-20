# Express Server Example

This example demonstrates how to integrate **Uploadista** with an **Express.js** server using the `@uploadista/adapters-express` package.

## 🚀 Features

- **Express.js integration** with Uploadista upload server
- **File upload handling** with chunked upload support  
- **Memory-based KV store** for upload metadata
- **Filesystem data store** for file storage
- **RESTful API** endpoints for upload management
- **Health checks** and server status
- **Client example** for testing uploads

## 📦 Installation

From the project root:

```bash
# Install dependencies
pnpm install

# Navigate to example directory  
cd examples/express-server

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
| `POST` | `/api/upload/` | Create new upload session |
| `PATCH` | `/api/upload/:id` | Upload file chunks |
| `GET` | `/api/upload/:id` | Get upload metadata |
| `GET` | `/api/upload/capabilities` | Get storage capabilities |

### Management Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health check |
| `GET` | `/api/upload-status/:id` | Get upload progress |
| `GET` | `/api/uploads` | List all uploads |
| `POST` | `/api/simple-upload` | Simple multipart upload |

## 📝 Usage Examples

### Basic Upload Flow

1. **Create Upload Session**
```bash
curl -X POST http://localhost:3000/api/upload/ \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test.txt",
    "size": 100,
    "type": "text/plain", 
    "storageId": "local"
  }'
```

2. **Upload File Content**
```bash
curl -X PATCH http://localhost:3000/api/upload/{upload-id} \
  -H "Content-Type: application/octet-stream" \
  --data-binary @test.txt
```

3. **Check Upload Status**
```bash
curl http://localhost:3000/api/upload-status/{upload-id}
```

### Using the Client Example

Run the included client example to test all functionality:

```bash
# Make sure the server is running first
pnpm run dev

# In another terminal, run the client example
tsx src/client-example.ts
```

The client will:
- Check server health
- Get server capabilities  
- Upload a test file
- Check upload status
- List all uploads

## 🏗️ Implementation Details

### Express Adapter Integration

```typescript
import { createExpressUploadAdapter } from '@uploadista/adapters-express';

const uploadAdapter = createExpressUploadAdapter({
  dataStore: getDataStore,
  kvStore,
  eventEmitter,
});

// Use as route handler
app.all('/api/upload/*', uploadAdapter.handler);
```

### Data Store Configuration

The example uses a filesystem data store:

```typescript
const getDataStore = async (storageId: string) => {
  switch (storageId) {
    case 'local':
      return new FilesystemDataStore({
        basePath: join(__dirname, '../uploads'),
        bucket: 'uploads',
      });
    default:
      throw new Error(\`Unknown storage ID: \${storageId}\`);
  }
};
```

### Event Handling

Simple event emitter for upload progress tracking:

```typescript
class SimpleEventEmitter implements EventEmitter<UploadEvent> {
  async emit(uploadId: string, event: UploadEvent): Promise<void> {
    // Handle upload events (progress, completion, etc.)
  }
}
```

## 📁 File Structure

```
express-server/
├── src/
│   ├── server.ts           # Main Express server
│   └── client-example.ts   # Client testing example
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration  
└── README.md             # This documentation
```

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | - | Environment (development/production) |

### Storage Configuration

Files are stored in `uploads/` directory relative to the server location. You can modify the data store configuration in `src/server.ts`:

```typescript
const getDataStore = async (storageId: string) => {
  // Customize storage locations here
  return new FilesystemDataStore({
    basePath: '/path/to/your/uploads',
    bucket: 'my-bucket',
  });
};
```

## 🧪 Testing

### Manual Testing

1. Start the server: `pnpm run dev`
2. Run client example: `tsx src/client-example.ts` 
3. Check the `uploads/` directory for uploaded files

### Using cURL

See the API examples above for cURL commands to test each endpoint.

### Using Postman/Insomnia

Import the following requests:

1. **Health Check**: `GET http://localhost:3000/health`
2. **Create Upload**: `POST http://localhost:3000/api/upload/` with JSON body
3. **Upload File**: `PATCH http://localhost:3000/api/upload/{id}` with binary body
4. **Get Status**: `GET http://localhost:3000/api/upload-status/{id}`

## 🚨 Production Considerations

For production deployment, consider:

1. **Database Storage**: Replace MemoryKvStore with persistent storage (Redis, PostgreSQL, etc.)
2. **File Storage**: Use cloud storage (S3, GCS, etc.) instead of filesystem
3. **Authentication**: Add user authentication and authorization
4. **Rate Limiting**: Implement upload rate limiting
5. **Error Handling**: Enhanced error handling and logging
6. **Monitoring**: Add metrics and health monitoring
7. **Security**: Validate file types, scan for malware, etc.

## 📚 Related Documentation

- [Uploadista Core Documentation](../../packages/uploadista/core/README.md)
- [Express Adapter Documentation](../../packages/uploadista/adapters-express/README.md)
- [Data Stores Documentation](../../packages/uploadista/data-stores/)
- [KV Stores Documentation](../../packages/uploadista/kv-stores/)

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

**TypeScript errors**
- Run `pnpm run build` to check for compilation errors
- Verify all workspace dependencies are built