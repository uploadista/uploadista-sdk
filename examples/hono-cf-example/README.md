# Uploadista Cloudflare Workers Example with Durable Objects

This example demonstrates how to deploy Uploadista to Cloudflare Workers using **Durable Objects** for WebSocket management and real-time upload progress.

## Features

- **Durable Objects WebSockets** - Hibernatable WebSocket connections for cost-efficient real-time updates
- **R2 Storage** - Cloudflare's object storage for file uploads
- **KV Store** - Metadata and state management
- **Hono Framework** - Fast, lightweight web framework
- **Image Processing** - Optimize, describe, and remove backgrounds from images
- **TypeScript** - Full type safety

## Architecture

This example uses the `honoDurableObjectAdapter` which routes WebSocket connections directly to Durable Object instances:

- **HTTP Requests** → Hono Router → Uploadista Server
- **WebSocket Connections** → Durable Object (per upload/flow)
- **No External Broadcaster** - Durable Objects manage their own state

Each upload or flow gets its own Durable Object instance, which:
- Manages WebSocket connections with hibernation API
- Emits progress events
- Cleans up automatically when done

## Prerequisites

1. [Cloudflare Workers account](https://workers.dev) (paid plan for Durable Objects)
2. [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed
3. Node.js 18+ or Bun

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Cloudflare Resources

Create the required resources in your Cloudflare account:

**R2 Bucket:**
```bash
wrangler r2 bucket create uploadista-assets
```

**KV Namespace:**
```bash
wrangler kv namespace create UPLOADISTA_KV
```

Update `wrangler.jsonc` with your resource IDs:

```jsonc
{
  "r2_buckets": [
    {
      "binding": "UPLOADISTA_BUCKET",
      "bucket_name": "uploadista-assets" // Your bucket name
    }
  ],
  "kv_namespaces": [
    {
      "binding": "UPLOADISTA_KV",
      "id": "YOUR_KV_NAMESPACE_ID" // From wrangler output
    }
  ],
  "durable_objects": {
    "bindings": [
      {
        "name": "UPLOADISTA_DO",
        "class_name": "UploadistaDurableObject"
      }
    ]
  }
}
```

### 3. Set Environment Variables (Optional)

For production, set these in Cloudflare dashboard or via wrangler:

```bash
wrangler secret put R2_DELIVERY_URL
# Enter: https://your-bucket.r2.dev
```

## Development

Start the local development server:

```bash
pnpm dev
```

This starts a local Cloudflare Workers environment at `http://localhost:8787`.

### Testing Uploads

You can test uploads using curl or any HTTP client:

```bash
# 1. Create an upload
curl -X POST http://localhost:8787/uploadista/api/upload \
  -H "Content-Type: application/json" \
  -d '{
    "flowId": "optimize-flow",
    "fileName": "test.jpg",
    "fileSize": 1024000,
    "contentType": "image/jpeg"
  }'

# Response: { "uploadId": "...", "uploadUrl": "..." }

# 2. Upload file chunks
curl -X PATCH http://localhost:8787/uploadista/api/upload/{uploadId} \
  --data-binary @test.jpg

# 3. Connect to WebSocket for real-time progress
# ws://localhost:8787/uploadista/ws/upload/{uploadId}
```

## Project Structure

```
src/
├── index.ts           # Main Worker entry point, routes, middleware
├── durable-object.ts  # Durable Object class for WebSocket handling
└── flows.ts          # Flow definitions (optimize, describe, etc.)

wrangler.jsonc        # Cloudflare Workers configuration
```

## Available Flows

This example includes four flows:

### 1. Simple Flow
Just stores the uploaded file to R2.

```typescript
flowId: "simple-flow"
```

### 2. Optimize Flow
Optimizes images to WebP format with 80% quality.

```typescript
flowId: "optimize-flow"
```

### 3. Describe Image Flow
Generates AI-powered descriptions of uploaded images.

```typescript
flowId: "describe-image-flow"
```

### 4. Remove Background Flow
Removes backgrounds from images using AI.

```typescript
flowId: "remove-background-flow"
```

## Deployment

Deploy to Cloudflare Workers:

```bash
pnpm deploy
```

Your Worker will be available at `https://hono-cf-example.{your-subdomain}.workers.dev`.

## How It Works

### 1. Durable Objects Adapter

The example uses `honoDurableObjectAdapter` which:
- Handles HTTP requests normally
- Does NOT provide a WebSocket handler (WebSockets route to DOs)
- Works with `durableObjectEventEmitter` for event emission

```typescript
const uploadistaServer = await createUploadistaServer({
  adapter: honoDurableObjectAdapter(),
  eventEmitter: durableObjectEventEmitter(env.UPLOADISTA_DO),
  // NO eventBroadcaster needed!
});
```

### 2. WebSocket Routing

WebSocket connections route directly to Durable Object instances:

```typescript
app.get("/uploadista/ws/upload/:uploadId", async (c) => {
  return routeWebSocketToDurableObject(c, c.env.UPLOADISTA_DO, {
    idParam: "uploadId",
  });
});
```

### 3. Durable Object Class

Each upload gets its own DO instance with hibernatable WebSockets:

```typescript
export class UploadistaDurableObject extends UploadistaDurableObjectImpl {
  // Inherits WebSocket handling, event emission, and hibernation support
}
```

## Cost Optimization

Durable Objects with hibernatable WebSockets are cost-efficient:

- **Hibernation** - WebSockets sleep when idle, no CPU time charged
- **Per-Entity** - Only pay for active uploads/flows
- **No Broadcaster** - Eliminates Redis/external sync costs

Typical costs for 1000 uploads/day:
- Durable Object requests: ~$0.15
- Duration charges: ~$0.05
- Total: **~$0.20/day**

## Differences from Standard Adapter

| Feature | This Example (DO) | Standard Adapter |
|---------|-------------------|------------------|
| Adapter | `honoDurableObjectAdapter` | `honoAdapter` |
| Event Emitter | `durableObjectEventEmitter` | `webSocketEventEmitter` |
| Event Broadcaster | Not needed | Required (Redis, memory) |
| WebSocket Routing | Direct to DO | Through adapter handler |
| Scaling | Per-entity DOs | Horizontal with sync |

## Troubleshooting

### "Durable Object not found"

Make sure you've deployed with migrations:

```bash
wrangler deploy
```

### WebSocket connection fails

Check that:
1. Durable Object binding is configured in `wrangler.jsonc`
2. `UPLOADISTA_DO` environment variable is set
3. WebSocket routes are defined correctly

### Local development issues

Durable Objects require `wrangler dev` (not `wrangler dev --local`):

```bash
pnpm dev  # Uses remote Durable Objects
```

## Resources

- [Uploadista Documentation](https://docs.uploadista.com)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Hibernatable WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [Hono Documentation](https://hono.dev/)

## License

MIT
