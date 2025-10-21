# Flow Processing Pipeline Example

Complete walkthrough of implementing a real-world image processing flow.

## Scenario: E-Commerce Product Images

User uploads a product image. Server should:
1. Validate it's an image
2. Remove background (AI)
3. Create multiple sizes (thumbnail, preview, full)
4. Optimize all variants
5. Store to S3
6. Return URLs to client

## Architecture Diagram

```
User Upload
    ↓
┌─────────────────────────────┐
│ Flow Engine                 │
├─────────────────────────────┤
│                             │
│ 1. Input                    │
│    ↓                        │
│ 2. Remove Background (AI)   │
│    ↓                        │
│ 3. Multiplex (3 outputs)    │
│    ├─ Thumbnail (200×200)   │
│    ├─ Preview (600×600)     │
│    └─ Full (1200×1200)      │
│    ↓                        │
│ 4. Optimize (each variant)  │
│    ├─ WebP, quality: 90     │
│    ├─ WebP, quality: 85     │
│    └─ WebP, quality: 80     │
│    ↓                        │
│ 5. Store to S3              │
│    ↓                        │
│ 6. Output                   │
│                             │
└─────────────────────────────┘
    ↓
Return URLs to Client
```

## Step 1: Server Setup

```typescript
// server.ts
import express from "express";
import { createUploadServer } from "@uploadista/adapters-express";
import { S3DataStore } from "@uploadista/data-store-s3";
import { RedisKVStore } from "@uploadista/kv-store-redis";
import { RedisBroadcaster } from "@uploadista/event-broadcaster-redis";
import { createFlowProcessor } from "@uploadista/core";

const app = express();

// Infrastructure
const storage = new S3DataStore({
  bucket: "product-images",
  region: "us-east-1",
});

const kvStore = new RedisKVStore({
  url: process.env.REDIS_URL,
});

const broadcaster = new RedisBroadcaster({
  url: process.env.REDIS_URL,
});

// Define product image flow
const productImageFlow = {
  id: "product-image",
  nodes: [
    // 1. Input: Receive uploaded file
    {
      id: "input",
      type: "input",
    },

    // 2. AI Background Removal
    {
      id: "remove-bg",
      type: "remove-background",
      params: {
        model: "rembg",
        returnFormat: "png",
      },
    },

    // 3. Split into 3 variants
    {
      id: "multiplex",
      type: "multiplex",
      params: {
        outputCount: 3,
      },
    },

    // 4. Thumbnail (200×200)
    {
      id: "thumbnail",
      type: "resize",
      params: {
        width: 200,
        height: 200,
        fit: "cover",
      },
    },

    // 5. Preview (600×600)
    {
      id: "preview",
      type: "resize",
      params: {
        width: 600,
        height: 600,
        fit: "contain",
      },
    },

    // 6. Full size (1200×1200)
    {
      id: "full",
      type: "resize",
      params: {
        width: 1200,
        height: 1200,
        fit: "contain",
      },
    },

    // 7. Optimize thumbnail to WebP
    {
      id: "optimize-thumb",
      type: "optimize",
      params: {
        quality: 90,
        format: "webp",
      },
    },

    // 8. Optimize preview to WebP
    {
      id: "optimize-preview",
      type: "optimize",
      params: {
        quality: 85,
        format: "webp",
      },
    },

    // 9. Optimize full to WebP
    {
      id: "optimize-full",
      type: "optimize",
      params: {
        quality: 80,
        format: "webp",
      },
    },

    // 10. Store all variants to S3
    {
      id: "store-thumb",
      type: "s3",
      params: {
        bucket: "product-images",
        prefix: "thumbnails/",
      },
    },

    {
      id: "store-preview",
      type: "s3",
      params: {
        bucket: "product-images",
        prefix: "previews/",
      },
    },

    {
      id: "store-full",
      type: "s3",
      params: {
        bucket: "product-images",
        prefix: "full/",
      },
    },

    // 11. Output all URLs
    {
      id: "output",
      type: "output",
    },
  ],

  edges: [
    // Input → Remove background
    { from: "input", to: "remove-bg" },

    // Background removed → Multiplex
    { from: "remove-bg", to: "multiplex" },

    // Multiplex to different sizes
    { from: "multiplex", to: "thumbnail", port: 0 },
    { from: "multiplex", to: "preview", port: 1 },
    { from: "multiplex", to: "full", port: 2 },

    // Resize → Optimize
    { from: "thumbnail", to: "optimize-thumb" },
    { from: "preview", to: "optimize-preview" },
    { from: "full", to: "optimize-full" },

    // Optimize → Store
    { from: "optimize-thumb", to: "store-thumb" },
    { from: "optimize-preview", to: "store-preview" },
    { from: "optimize-full", to: "store-full" },

    // Store → Output
    { from: "store-thumb", to: "output" },
    { from: "store-preview", to: "output" },
    { from: "store-full", to: "output" },
  ],
};

// Mount upload server with flow
app.use(
  "/api",
  createUploadServer({
    storage,
    kvStore,
    broadcaster,
    flows: [productImageFlow],
    context: async (req) => ({
      userId: req.user?.id,
      flowId: req.query.flowId || "product-image",
    }),
  })
);

app.listen(3000, () => {
  console.log("Server listening on port 3000");
});
```

## Step 2: Client Implementation

```tsx
// UploadProductImage.tsx
import React from "react";
import { useFlowUpload } from "@uploadista/react";

interface ProcessedImage {
  thumbnail: string;
  preview: string;
  full: string;
}

export function UploadProductImage() {
  const [images, setImages] = React.useState<ProcessedImage[]>([]);
  const [uploading, setUploading] = React.useState(false);

  const { upload, progress, isProcessing, error } = useFlowUpload({
    serverUrl: "https://api.example.com",
    flowId: "product-image",
    onProcessingComplete: (result) => {
      console.log("Processing complete:", result);
      // result contains URLs for all variants
      setImages((prev) => [...prev, result]);
      setUploading(false);
    },
    onError: (err) => {
      console.error("Upload error:", err);
      setUploading(false);
    },
  });

  return (
    <div style={{ padding: "20px" }}>
      <h2>Upload Product Image</h2>

      {!uploading && (
        <div
          style={{
            border: "2px dashed gray",
            padding: "20px",
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setUploading(true);
                upload(file);
              }
            }}
            style={{ display: "none" }}
            id="file-input"
          />
          <label
            htmlFor="file-input"
            style={{ cursor: "pointer" }}
          >
            Click to upload or drag & drop
          </label>
        </div>
      )}

      {/* Upload Progress */}
      {uploading && (
        <div style={{ marginTop: "20px" }}>
          <p>Uploading: {progress}%</p>
          <progress value={progress} max={100} />
        </div>
      )}

      {/* Processing Status */}
      {isProcessing && (
        <div style={{ marginTop: "20px", color: "blue" }}>
          <p>Processing image...</p>
          <p>• Removing background...</p>
          <p>• Resizing variants...</p>
          <p>• Optimizing...</p>
        </div>
      )}

      {/* Error Handling */}
      {error && (
        <div
          style={{
            marginTop: "20px",
            padding: "10px",
            backgroundColor: "#fee",
            color: "red",
            borderRadius: "4px",
          }}
        >
          <p>Error: {error.message}</p>
        </div>
      )}

      {/* Display Processed Images */}
      <div style={{ marginTop: "30px" }}>
        <h3>Processed Images ({images.length})</h3>
        {images.map((img, idx) => (
          <div
            key={idx}
            style={{
              marginBottom: "30px",
              border: "1px solid #ddd",
              padding: "20px",
            }}
          >
            <h4>Product Image {idx + 1}</h4>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "20px",
                marginBottom: "20px",
              }}
            >
              {/* Thumbnail */}
              <div>
                <h5>Thumbnail (200×200)</h5>
                <img src={img.thumbnail} alt="Thumbnail" width={200} />
                <p
                  style={{ fontSize: "12px", wordBreak: "break-all" }}
                >
                  {img.thumbnail}
                </p>
              </div>

              {/* Preview */}
              <div>
                <h5>Preview (600×600)</h5>
                <img src={img.preview} alt="Preview" width={300} />
                <p style={{ fontSize: "12px", wordBreak: "break-all" }}>
                  {img.preview}
                </p>
              </div>

              {/* Full */}
              <div>
                <h5>Full (1200×1200)</h5>
                <img src={img.full} alt="Full" width={400} />
                <p style={{ fontSize: "12px", wordBreak: "break-all" }}>
                  {img.full}
                </p>
              </div>
            </div>

            {/* Copy to Clipboard Buttons */}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(img.thumbnail);
                  alert("Thumbnail URL copied!");
                }}
              >
                Copy Thumbnail URL
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(img.preview);
                  alert("Preview URL copied!");
                }}
              >
                Copy Preview URL
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(img.full);
                  alert("Full URL copied!");
                }}
              >
                Copy Full URL
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Step 3: Real-Time Progress with WebSocket

```tsx
// UploadProductImageWithRealtime.tsx
import React from "react";
import { useFlowUpload } from "@uploadista/react";

export function UploadProductImageWithRealtime() {
  const [events, setEvents] = React.useState<string[]>([]);

  const { upload, events$, progress } = useFlowUpload({
    serverUrl: "https://api.example.com",
    streamUrl: "wss://api.example.com/api/stream",
    flowId: "product-image",
  });

  // Subscribe to WebSocket events
  React.useEffect(() => {
    const subscription = events$?.subscribe((event) => {
      console.log("Event:", event);

      let message = "";
      switch (event.type) {
        case "upload.progress":
          message = `📤 Upload: ${event.progress}%`;
          break;
        case "flow.started":
          message = "⚙️ Processing started";
          break;
        case "flow.node.started":
          message = `⚙️ Running: ${event.nodeId}`;
          break;
        case "flow.node.completed":
          message = `✓ Completed: ${event.nodeId}`;
          break;
        case "flow.completed":
          message = "✓ All done!";
          break;
        case "flow.error":
          message = `✗ Error: ${event.error}`;
          break;
      }

      if (message) {
        setEvents((prev) => [...prev, message]);
      }
    });

    return () => subscription?.unsubscribe();
  }, [events$]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
      {/* Upload Section */}
      <div>
        <h2>Upload</h2>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
        />
        <progress value={progress} max={100} />
        <p>Progress: {progress}%</p>
      </div>

      {/* Real-Time Events */}
      <div>
        <h2>Processing Events</h2>
        <div
          style={{
            border: "1px solid #ddd",
            padding: "10px",
            height: "300px",
            overflow: "auto",
            fontFamily: "monospace",
            fontSize: "12px",
          }}
        >
          {events.map((event, idx) => (
            <div key={idx}>
              <code>{event}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

## Step 4: Advanced - Conditional Routing

What if some images don't need background removal?

```typescript
// More advanced flow with conditional logic
const smartProductImageFlow = {
  id: "smart-product-image",
  nodes: [
    { id: "input", type: "input" },

    // Check if image is already high quality
    {
      id: "check-quality",
      type: "describe-image",
      params: {},
    },

    // Route based on image properties
    {
      id: "should-remove-bg",
      type: "conditional",
      params: {
        field: "width",
        operator: "greaterThan",
        value: 1000, // Only remove BG for large images
      },
    },

    // Branch 1: Remove background (large images)
    {
      id: "remove-bg",
      type: "remove-background",
      params: { model: "rembg" },
    },

    // Branch 2: Skip removal (small images)
    // (Direct to multiplex)

    // Multiplex to variants
    { id: "multiplex", type: "multiplex", params: { outputCount: 3 } },

    // ... rest of processing
  ],

  edges: [
    { from: "input", to: "check-quality" },
    { from: "check-quality", to: "should-remove-bg" },

    // YES branch: Remove background
    { from: "should-remove-bg", to: "remove-bg", condition: true },
    { from: "remove-bg", to: "multiplex" },

    // NO branch: Skip removal
    { from: "should-remove-bg", to: "multiplex", condition: false },

    // ... rest
  ],
};
```

## Step 5: Error Handling & Retry Logic

```typescript
// Fallback flow without AI processing
const productImageFlowWithFallback = {
  id: "product-image-with-fallback",
  nodes: [
    { id: "input", type: "input" },

    // Try AI background removal
    {
      id: "remove-bg",
      type: "remove-background",
      params: {
        model: "rembg",
        returnFormat: "png",
        // Timeout after 20 seconds
        timeout: 20000,
      },
    },

    // Fallback: If removal fails, continue without
    {
      id: "remove-bg-fallback",
      type: "multiplex", // Pass-through
      params: { outputCount: 1 },
    },

    // ... rest of processing
  ],

  edges: [
    { from: "input", to: "remove-bg" },

    // Success: Remove BG → Multiplex
    { from: "remove-bg", to: "multiplex" },

    // Error: Skip removal → Multiplex
    // (Implement error edge in executor)
    { from: "remove-bg-fallback", to: "multiplex" },
  ],

  errorHandling: {
    // Retry AI operations up to 3 times
    "remove-bg": {
      maxRetries: 3,
      retryDelay: 1000,
      backoff: "exponential",
    },
  },
};
```

## Performance Analysis

### Timing Breakdown

```
User clicks upload
    ↓
Upload file: 2s (5MB, S3 multipart)
    ↓
Remove Background (AI): 10s (Replicate API)
    ↓
Resize Variants: 200ms (in parallel)
    ↓
Optimize (WebP): 500ms (3 variants)
    ↓
Upload to S3: 1s
    ↓
Return URLs: 13.7s total

Concurrent Processing: 8.2s total
```

### Cost Estimate (per image)

```
S3 Upload: $0.0005 (1 put + 3 gets)
S3 Storage: $0.000023 (per month, ~3 images)
Replicate (Remove BG): $0.002
Compute (resize/optimize): $0 (included in server)
────────────────────────
Total: $0.0025 per image (~$2.50 per 1000)
```

### Optimization Tips

1. **Cache Flows**: Don't recreate flows for each request
2. **Parallel Processing**: Run multiple variants simultaneously
3. **Async Processing**: Don't wait for all variants to complete
4. **Batch Operations**: Process multiple images together
5. **CDN**: Serve results from CloudFlare or similar

## Testing the Flow

```bash
# 1. Start server
npm run dev

# 2. Upload test image
curl -X POST http://localhost:3000/api/upload \
  -F "file=@test.jpg" \
  -F "flowId=product-image"

# 3. Monitor progress
# Open WebSocket: ws://localhost:3000/api/stream

# 4. Verify S3
aws s3 ls s3://product-images/thumbnails/
aws s3 ls s3://product-images/previews/
aws s3 ls s3://product-images/full/
```

## Production Deployment

```yaml
# docker-compose.yml
version: "3.8"

services:
  server:
    build: .
    ports:
      - "3000:3000"
    environment:
      REDIS_URL: redis://redis:6379
      S3_BUCKET: product-images
      AWS_REGION: us-east-1
      REPLICATE_API_KEY: ${REPLICATE_API_KEY}
    depends_on:
      - redis

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  # Optional: Process heavy flows in separate worker
  flow-worker:
    build: .
    environment:
      REDIS_URL: redis://redis:6379
      WORKER_MODE: true
    depends_on:
      - redis
```

## Next Steps

1. **Extend the Flow**: Add more processing steps (filters, effects, etc.)
2. **Batch Processing**: Process multiple images in one request
3. **Analytics**: Track processing times and costs
4. **Monitoring**: Set up error alerts and performance monitoring
5. **Caching**: Cache processed variants for repeated uploads

## Related Documentation

- [FLOW_NODES.md](./packages/flow/FLOW_NODES.md) - All node types
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- [SERVER_SETUP.md](./SERVER_SETUP.md) - Server configuration
- [@uploadista/flow-images-replicate](./packages/flow/images/replicate/README.md)
- [@uploadista/flow-images-sharp](./packages/flow/images/sharp/README.md)
