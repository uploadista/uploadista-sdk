# Batch Processing Example

Complete guide for handling multiple file uploads with coordinated processing.

## Scenario: Photo Album Upload

User uploads 50 photos from vacation. System should:
1. Accept multiple files concurrently
2. Validate each file
3. Optimize each image
4. Create different sizes
5. Group results by folder
6. Generate album metadata
7. Create shareable link

## Architecture Diagram

```
User uploads 50 photos
    ↓
Client (Parallel uploads, max 3 concurrent)
    ├─ Photo 1 ──→ Server
    ├─ Photo 2 ──→ Server
    ├─ Photo 3 ──→ Server  (max 3 in parallel)
    ├─ Photo 4 ──→ (waiting)
    └─ ... 50 more
    ↓
Server (Process each flow)
    ├─ Flow 1: Photo 1 → Resize → Optimize → S3
    ├─ Flow 2: Photo 2 → Resize → Optimize → S3
    └─ Flow 3: Photo 3 → Resize → Optimize → S3
    ↓
Batch Coordinator
    ├─ Track all uploads
    ├─ Generate metadata
    ├─ Create archive
    └─ Generate album URL
    ↓
Return album URL to user
```

## Step 1: Client - Batch Upload Manager

```tsx
// BatchUploadManager.tsx
import React, { useState, useCallback } from "react";
import { useMultiUpload } from "@uploadista/react";

interface BatchState {
  totalFiles: number;
  completedFiles: number;
  totalSize: number;
  uploadedSize: number;
  errors: string[];
  albumUrl?: string;
}

export function BatchUploadManager() {
  const [batchState, setBatchState] = useState<BatchState>({
    totalFiles: 0,
    completedFiles: 0,
    totalSize: 0,
    uploadedSize: 0,
    errors: [],
  });

  const [albumName, setAlbumName] = useState("");
  const [description, setDescription] = useState("");

  const { uploads, addFiles, cancel, completed } = useMultiUpload({
    serverUrl: "https://api.example.com",
    chunkSize: 5 * 1024 * 1024, // 5MB chunks
    concurrentChunks: 2, // 2 parallel chunks per file
    onComplete: async (results) => {
      console.log("All uploads complete:", results);

      // Create batch metadata
      const batchId = generateBatchId();
      const albumData = {
        id: batchId,
        name: albumName,
        description,
        photos: results.map((r) => ({
          id: r.id,
          filename: r.filename,
          size: r.size,
          url: r.url,
          uploadedAt: new Date().toISOString(),
        })),
        createdAt: new Date().toISOString(),
        totalSize: batchState.totalSize,
        totalPhotos: results.length,
      };

      // Send batch metadata to server
      const response = await fetch(
        "https://api.example.com/albums",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(albumData),
        }
      );

      const album = await response.json();
      setBatchState((prev) => ({
        ...prev,
        albumUrl: album.shareUrl,
      }));
    },
    onError: (error) => {
      setBatchState((prev) => ({
        ...prev,
        errors: [...prev.errors, error.message],
      }));
    },
  });

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);

      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);

      setBatchState((prev) => ({
        ...prev,
        totalFiles: files.length,
        totalSize,
      }));

      console.log(
        `Uploading ${files.length} files (${totalSizeMB}MB total)`
      );

      addFiles(files);
    },
    [addFiles]
  );

  const overallProgress = batchState.totalSize > 0
    ? Math.round(
        (batchState.uploadedSize / batchState.totalSize) * 100
      )
    : 0;

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>📸 Batch Photo Upload</h1>

      {!batchState.albumUrl && !uploads.length && (
        <div>
          <input
            type="text"
            placeholder="Album name (e.g., 'Vacation 2024')"
            value={albumName}
            onChange={(e) => setAlbumName(e.target.value)}
            style={{ width: "100%", padding: "8px", marginBottom: "10px" }}
          />

          <textarea
            placeholder="Album description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              marginBottom: "10px",
              height: "60px",
            }}
          />

          <div
            style={{
              border: "2px dashed #ccc",
              padding: "40px",
              textAlign: "center",
              cursor: "pointer",
              borderRadius: "8px",
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = "blue";
            }}
            onDragLeave={(e) => {
              e.currentTarget.style.borderColor = "#ccc";
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = "#ccc";
              handleFileSelect({
                target: { files: e.dataTransfer.files },
              } as any);
            }}
          >
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: "none" }}
              id="batch-file-input"
            />
            <label
              htmlFor="batch-file-input"
              style={{ cursor: "pointer", fontSize: "16px" }}
            >
              📁 Click to select photos or drag & drop
              <br />
              <small>(Multiple files supported)</small>
            </label>
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {uploads.length > 0 && !batchState.albumUrl && (
        <div style={{ marginTop: "30px" }}>
          <h2>Upload Progress</h2>

          <div
            style={{
              backgroundColor: "#f0f0f0",
              padding: "20px",
              borderRadius: "8px",
            }}
          >
            <div style={{ marginBottom: "10px" }}>
              <strong>
                {completed} / {batchState.totalFiles} files
                uploaded
              </strong>
            </div>

            <progress
              value={completed}
              max={batchState.totalFiles}
              style={{ width: "100%", height: "30px" }}
            />

            <div style={{ marginTop: "10px", fontSize: "14px" }}>
              <div>
                Total Progress:{" "}
                <strong>{overallProgress}%</strong>
              </div>
              <div>
                Size: {(batchState.uploadedSize / 1024 / 1024).toFixed(2)}/
                {(batchState.totalSize / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
          </div>

          {/* Individual File Progress */}
          <h3>Files</h3>
          <div
            style={{
              maxHeight: "400px",
              overflow: "auto",
              backgroundColor: "#fff",
              border: "1px solid #ddd",
              borderRadius: "8px",
            }}
          >
            {uploads.map((upload) => (
              <div
                key={upload.id}
                style={{
                  padding: "10px",
                  borderBottom: "1px solid #eee",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div>
                    <strong>{upload.file.name}</strong>
                  </div>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    {(upload.file.size / 1024 / 1024).toFixed(2)} MB |
                    Progress: {upload.progress}%
                  </div>
                  <progress
                    value={upload.progress}
                    max={100}
                    style={{ width: "100%", marginTop: "5px" }}
                  />
                </div>

                {upload.progress < 100 && (
                  <button
                    onClick={() => cancel(upload.id)}
                    style={{
                      marginLeft: "10px",
                      padding: "5px 10px",
                      backgroundColor: "#f44",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    ✕ Cancel
                  </button>
                )}
              </div>
            ))}
          </div>

          {batchState.errors.length > 0 && (
            <div
              style={{
                marginTop: "20px",
                padding: "10px",
                backgroundColor: "#fee",
                border: "1px solid #f44",
                borderRadius: "4px",
              }}
            >
              <strong>Errors ({batchState.errors.length}):</strong>
              <ul>
                {batchState.errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Success - Album Created */}
      {batchState.albumUrl && (
        <div
          style={{
            marginTop: "30px",
            padding: "20px",
            backgroundColor: "#efe",
            border: "1px solid #4f4",
            borderRadius: "8px",
            textAlign: "center",
          }}
        >
          <h2>✓ Album Created!</h2>
          <p>
            <strong>{batchState.totalFiles}</strong> photos uploaded
            successfully
          </p>
          <p>
            <strong>Album:</strong> {albumName}
          </p>

          <div style={{ marginTop: "20px" }}>
            <h3>Share your album</h3>
            <input
              type="text"
              value={batchState.albumUrl}
              readOnly
              style={{
                width: "100%",
                padding: "10px",
                marginBottom: "10px",
                fontFamily: "monospace",
              }}
            />

            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  batchState.albumUrl!
                );
                alert("Album URL copied!");
              }}
              style={{
                padding: "10px 20px",
                backgroundColor: "#4f4",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                marginRight: "10px",
              }}
            >
              📋 Copy URL
            </button>

            <a
              href={batchState.albumUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: "10px 20px",
                backgroundColor: "#44f",
                color: "white",
                textDecoration: "none",
                borderRadius: "4px",
                display: "inline-block",
              }}
            >
              🔗 View Album
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function generateBatchId(): string {
  return `album-${Date.now()}-${Math.random()
    .toString(36)
    .substring(7)}`;
}
```

## Step 2: Server - Batch Coordinator

```typescript
// server.ts - Batch processing endpoints
import express from "express";
import { createUploadistaServer } from "@uploadista/server";
import { S3DataStore } from "@uploadista/data-store-s3";
import { RedisKVStore } from "@uploadista/kv-store-redis";
import { RedisBroadcaster } from "@uploadista/event-broadcaster-redis";

const app = express();
const storage = new S3DataStore({ bucket: "photo-albums" });
const kvStore = new RedisKVStore({ url: process.env.REDIS_URL });
const broadcaster = new RedisBroadcaster({
  url: process.env.REDIS_URL,
});

// Store album metadata in a database
const albumsDB = new Map<string, Album>();

interface Album {
  id: string;
  name: string;
  description: string;
  photos: Photo[];
  createdAt: string;
  totalSize: number;
  totalPhotos: number;
  shareUrl: string;
}

interface Photo {
  id: string;
  filename: string;
  size: number;
  url: string;
  uploadedAt: string;
}

// Define batch image flow
const batchPhotoFlow = {
  id: "batch-photo",
  nodes: [
    { id: "input", type: "input" },

    // Create 3 sizes
    { id: "split", type: "multiplex", params: { outputCount: 3 } },

    // Thumbnail
    {
      id: "thumb",
      type: "resize",
      params: { width: 300, height: 300, fit: "cover" },
    },

    // Medium
    {
      id: "medium",
      type: "resize",
      params: { width: 800, height: 800, fit: "contain" },
    },

    // Full
    { id: "full", type: "optimize", params: { quality: 85 } },

    // Store with album prefix
    {
      id: "store-thumb",
      type: "s3",
      params: { prefix: "albums/{albumId}/thumbs/" },
    },

    {
      id: "store-medium",
      type: "s3",
      params: { prefix: "albums/{albumId}/medium/" },
    },

    {
      id: "store-full",
      type: "s3",
      params: { prefix: "albums/{albumId}/full/" },
    },

    { id: "output", type: "output" },
  ],

  edges: [
    { from: "input", to: "split" },
    { from: "split", to: "thumb", port: 0 },
    { from: "split", to: "medium", port: 1 },
    { from: "split", to: "full", port: 2 },
    { from: "thumb", to: "store-thumb" },
    { from: "medium", to: "store-medium" },
    { from: "full", to: "store-full" },
    { from: "store-thumb", to: "output" },
    { from: "store-medium", to: "output" },
    { from: "store-full", to: "output" },
  ],
};

// Mount upload server
app.use(
  "/api",
  createUploadServer({
    storage,
    kvStore,
    broadcaster,
    flows: [batchPhotoFlow],
  })
);

// Batch endpoints
app.post("/albums", express.json(), async (req, res) => {
  try {
    const { id, name, description, photos, totalSize, totalPhotos } =
      req.body;

    // Generate shareable token
    const shareToken = generateToken(16);
    const shareUrl = `https://app.example.com/albums/${shareToken}`;

    const album: Album = {
      id,
      name,
      description,
      photos,
      totalSize,
      totalPhotos,
      createdAt: new Date().toISOString(),
      shareUrl,
    };

    albumsDB.set(id, album);

    // Store in database (implement with real DB)
    await kvStore.set(`album:${id}`, JSON.stringify(album));

    res.json({
      id,
      name,
      shareUrl,
      totalPhotos,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get album by share token
app.get("/albums/:shareToken", async (req, res) => {
  try {
    // Lookup share token in database
    // For demo, iterate through albums
    const album = Array.from(albumsDB.values()).find((a) =>
      a.shareUrl.includes(req.params.shareToken)
    );

    if (!album) {
      return res.status(404).json({ error: "Album not found" });
    }

    res.json(album);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get album stats
app.get("/albums/:id/stats", async (req, res) => {
  try {
    const album = albumsDB.get(req.params.id);
    if (!album) {
      return res.status(404).json({ error: "Album not found" });
    }

    res.json({
      totalPhotos: album.totalPhotos,
      totalSize: album.totalSize,
      averagePhotoSize: album.totalSize / album.totalPhotos,
      createdAt: album.createdAt,
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.listen(3000, () => {
  console.log("Server listening on port 3000");
});

function generateToken(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < length; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
```

## Step 3: Parallel Upload Optimization

```tsx
// useParallelBatchUpload.ts - Custom hook for optimized batch uploads
import { useState, useCallback } from "react";

interface ParallelUploadConfig {
  maxConcurrent?: number; // Max parallel uploads
  chunkSize?: number;
  retryAttempts?: number;
}

export function useParallelBatchUpload(
  config: ParallelUploadConfig = {}
) {
  const {
    maxConcurrent = 3,
    chunkSize = 5 * 1024 * 1024,
    retryAttempts = 3,
  } = config;

  const [queue, setQueue] = useState<File[]>([]);
  const [uploading, setUploading] = useState<Map<string, number>>(
    new Map()
  );
  const [completed, setCompleted] = useState<string[]>([]);
  const [failed, setFailed] = useState<string[]>([]);

  const uploadFile = useCallback(
    async (file: File) => {
      const fileId = `${file.name}-${file.size}`;

      for (let attempt = 0; attempt < retryAttempts; attempt++) {
        try {
          // Upload with progress tracking
          const response = await fetch(
            "https://api.example.com/upload",
            {
              method: "POST",
              body: file,
              headers: {
                "X-File-Name": file.name,
                "X-File-Size": file.size.toString(),
              },
            }
          );

          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          setCompleted((prev) => [...prev, fileId]);
          return;
        } catch (error) {
          if (attempt === retryAttempts - 1) {
            setFailed((prev) => [...prev, fileId]);
            return;
          }

          // Exponential backoff
          await new Promise((r) =>
            setTimeout(r, Math.pow(2, attempt) * 1000)
          );
        }
      }
    },
    [retryAttempts]
  );

  const processQueue = useCallback(async () => {
    const active = uploading.size;

    if (active >= maxConcurrent || queue.length === 0) {
      return;
    }

    const file = queue.shift()!;
    const fileId = `${file.name}-${file.size}`;

    setUploading((prev) => new Map(prev).set(fileId, 0));

    await uploadFile(file);

    setUploading((prev) => {
      const next = new Map(prev);
      next.delete(fileId);
      return next;
    });

    // Process next file
    processQueue();
  }, [queue, uploading, maxConcurrent, uploadFile]);

  const addFilesToQueue = useCallback(
    (files: File[]) => {
      setQueue((prev) => [...prev, ...files]);
      processQueue();
    },
    [processQueue]
  );

  return {
    queue,
    uploading,
    completed,
    failed,
    addFilesToQueue,
    processQueue,
  };
}
```

## Step 4: Advanced - Batch with Video Support

```typescript
// Extended flow supporting mixed media
const mixedMediaFlow = {
  id: "mixed-media-batch",
  nodes: [
    { id: "input", type: "input" },

    // Branch 1: Images
    {
      id: "is-image",
      type: "conditional",
      params: {
        field: "mimeType",
        operator: "startsWith",
        value: "image/",
      },
    },

    // Image processing
    {
      id: "image-resize",
      type: "resize",
      params: { width: 1200, fit: "contain" },
    },

    {
      id: "image-optimize",
      type: "optimize",
      params: { quality: 85, format: "webp" },
    },

    // Branch 2: Videos (pass-through for now)
    { id: "video-passthrough", type: "multiplex", params: {} },

    // Store both
    {
      id: "store-processed",
      type: "s3",
      params: { prefix: "media/{type}/" },
    },

    { id: "output", type: "output" },
  ],

  edges: [
    { from: "input", to: "is-image" },

    // Images
    { from: "is-image", to: "image-resize", condition: true },
    { from: "image-resize", to: "image-optimize" },
    { from: "image-optimize", to: "store-processed" },

    // Videos
    { from: "is-image", to: "video-passthrough", condition: false },
    { from: "video-passthrough", to: "store-processed" },

    // Output
    { from: "store-processed", to: "output" },
  ],
};
```

## Step 5: Monitoring & Analytics

```typescript
// Server analytics for batch uploads
interface BatchAnalytics {
  batchId: string;
  totalFiles: number;
  totalSize: number;
  uploadTime: number; // ms
  processingTime: number; // ms
  averageFileSize: number;
  succeededCount: number;
  failedCount: number;
  costs: {
    storage: number;
    transfer: number;
    processing: number;
  };
}

async function trackBatchAnalytics(batchId: string) {
  const batch = albumsDB.get(batchId);
  if (!batch) return;

  const analytics: BatchAnalytics = {
    batchId,
    totalFiles: batch.totalPhotos,
    totalSize: batch.totalSize,
    uploadTime: 0, // Track from session
    processingTime: 0, // Track from flow
    averageFileSize: batch.totalSize / batch.totalPhotos,
    succeededCount: batch.totalPhotos,
    failedCount: 0,
    costs: {
      storage: batch.totalSize * 0.000023, // ~$0.023 per GB/month
      transfer: batch.totalSize * 0.0000002, // ~$0.0002 per GB egress
      processing: batch.totalPhotos * 0.0025, // $0.0025 per image
    },
  };

  console.log("Batch Analytics:", analytics);
  // Send to analytics service
}
```

## Performance Tips

### 1. Optimal Concurrency

```typescript
// Rule of thumb: 3-5 concurrent uploads
// More = better throughput but higher memory
// Less = slower but more stable

// Network-aware concurrency
function getOptimalConcurrency(): number {
  const connection = navigator.connection as any;
  if (!connection) return 3;

  const effectiveType = connection.effectiveType;
  switch (effectiveType) {
    case "4g":
      return 5;
    case "3g":
      return 3;
    case "2g":
      return 1;
    default:
      return 3;
  }
}
```

### 2. Chunk Size Optimization

```typescript
// Larger chunks = faster for big files
// Smaller chunks = better resume/retry experience

const optimalChunkSize = (fileSize: number): number => {
  if (fileSize < 10 * 1024 * 1024) return 1 * 1024 * 1024; // 1MB
  if (fileSize < 100 * 1024 * 1024) return 5 * 1024 * 1024; // 5MB
  return 50 * 1024 * 1024; // 50MB
};
```

### 3. Memory Management

```typescript
// Cleanup completed uploads from memory
setInterval(() => {
  // Remove completed uploads older than 1 hour
  const onHourAgo = Date.now() - 60 * 60 * 1000;
  uploads.forEach((upload) => {
    if (
      upload.completed &&
      upload.completedAt < onHourAgo
    ) {
      uploads.delete(upload.id);
    }
  });
}, 5 * 60 * 1000); // Every 5 minutes
```

## Testing Batch Uploads

```bash
# Generate test images
for i in {1..10}; do
  convert -size 1024x768 xc:blue test-$i.jpg
done

# Upload batch
curl -X POST https://api.example.com/albums \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Album",
    "photos": ['$(for f in test-*.jpg; do echo "{\"filename\": \"$f\"}"; done | paste -sd, -)',']
  }'

# Monitor progress with WebSocket
wscat -c wss://api.example.com/api/stream
```

## Production Deployment

```yaml
# kubernetes batch upload job
apiVersion: batch/v1
kind: Job
metadata:
  name: batch-upload-processor
spec:
  template:
    spec:
      containers:
        - name: processor
          image: uploadista-server:latest
          env:
            - name: WORKER_MODE
              value: "true"
            - name: MAX_CONCURRENT_BATCHES
              value: "10"
            - name: MAX_CONCURRENT_PER_BATCH
              value: "5"
            - name: BATCH_TIMEOUT
              value: "3600" # 1 hour
          resources:
            requests:
              memory: "1Gi"
              cpu: "1"
            limits:
              memory: "2Gi"
              cpu: "2"
      restartPolicy: Never
  backoffLimit: 3
```

## Next Steps

1. **Distributed Processing**: Use message queues (RabbitMQ, Kafka) for large batches
2. **Batch Retry**: Implement smart retry for failed uploads
3. **Scheduling**: Schedule batch processing during off-peak hours
4. **Notifications**: Send email/webhook when batch completes
5. **Analytics**: Track and optimize batch processing metrics

## Related Documentation

- [BATCH_PROCESSING_EXAMPLE.md](./BATCH_PROCESSING_EXAMPLE.md) (this file)
- [FLOW_PROCESSING_EXAMPLE.md](./FLOW_PROCESSING_EXAMPLE.md)
- [CLIENT_INTEGRATION.md](./CLIENT_INTEGRATION.md)
- [SERVER_SETUP.md](./SERVER_SETUP.md)
