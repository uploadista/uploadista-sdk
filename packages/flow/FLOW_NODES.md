# Uploadista Flow Nodes Gallery

Complete guide to all available flow processing nodes.

## Node Categories

### Utility Nodes

Transform data flow and control logic.

#### Conditional Node
**Package**: `@uploadista/flow-utility-nodes`

Routes inputs based on file properties.

```typescript
{
  type: "conditional",
  params: {
    field: "mimeType" | "size" | "width" | "height" | "extension",
    operator: "equals" | "notEquals" | "greaterThan" | "lessThan" | "contains" | "startsWith",
    value: string | number,
  },
}
```

**Use Cases**:
- Route images to resize, documents to compress
- Size-based routing (large files differently)
- Format-specific processing

#### Merge Node
**Package**: `@uploadista/flow-utility-nodes`

Combine multiple inputs into batch.

```typescript
{
  type: "merge",
  params: {
    strategy: "concat" | "batch",
    inputCount: 2-10,
    separator?: string,
  },
}
```

**Use Cases**:
- Batch upload processing
- Combine files before archiving
- Wait for multiple inputs

#### Multiplex Node
**Package**: `@uploadista/flow-utility-nodes`

Split single input to multiple outputs.

```typescript
{
  type: "multiplex",
  params: {
    outputCount: 2-5,
  },
}
```

**Use Cases**:
- Multi-destination delivery (S3 + backup)
- Create multiple sizes simultaneously
- Parallel processing paths

#### Zip Node
**Package**: `@uploadista/flow-utility-zipjs`

Create ZIP archives.

```typescript
{
  type: "zip",
  params: {
    filename: string,
    compressionLevel?: 0-9,
    comment?: string,
  },
}
```

**Use Cases**:
- Archive multiple files
- Batch delivery
- Backup creation

### Image Processing Nodes

Image optimization and transformation.

#### Resize Node
**Package**: `@uploadista/flow-images-sharp` or `@uploadista/flow-images-photon`

Scale images to dimensions.

```typescript
{
  type: "resize",
  params: {
    width?: number,
    height?: number,
    fit: "cover" | "contain" | "fill",
  },
}
```

**Use Cases**:
- Create thumbnails
- Generate responsive variants (mobile/tablet/desktop)
- Normalize image sizes

**Sharp (Node.js)**: ~50-100ms
**Photon (Edge)**: ~5-10ms

#### Optimize Node
**Package**: `@uploadista/flow-images-sharp` or `@uploadista/flow-images-photon`

Compress and convert images.

```typescript
{
  type: "optimize",
  params: {
    quality: 1-100,
    format: "jpeg" | "png" | "webp" | "avif",
  },
}
```

**Use Cases**:
- Reduce file size
- Convert format (JPEG → WebP)
- Auto-format selection by browser

**Recommended Settings**:
- `quality: 85, format: "webp"` for balance
- `quality: 90, format: "jpeg"` for compatibility
- `quality: 75, format: "avif"` for maximum compression

#### Describe Image Node
**Package**: `@uploadista/flow-images-nodes`

Extract image metadata.

```typescript
{
  type: "describe-image",
  params: {},
}
```

**Output**:
```json
{
  "width": 1920,
  "height": 1080,
  "format": "jpeg",
  "space": "srgb",
  "channels": 3,
  "depth": 8,
  "hasAlpha": false,
  "exif": { /* EXIF data */ }
}
```

**Use Cases**:
- Index image dimensions
- Extract camera info
- Validation before processing

#### Remove Background Node
**Package**: `@uploadista/flow-images-replicate`

AI background removal.

```typescript
{
  type: "remove-background",
  params: {
    model: "rembg",
    returnFormat: "png",
  },
}
```

**Use Cases**:
- E-commerce product images
- Avatar generation
- Professional headshots

**Time**: ~5-15s | **Cost**: ~$0.001-0.002

#### Upscale Node
**Package**: `@uploadista/flow-images-replicate`

Enhance image resolution.

```typescript
{
  type: "upscale",
  params: {
    scale: 2 | 4,
    model: "real-esrgan",
  },
}
```

**Use Cases**:
- Improve low-resolution images
- Retina display preparation
- Photo enhancement

**Time**: ~10-20s | **Cost**: ~$0.01-0.05

#### Wait for URL Node
**Package**: `@uploadista/flow-images-nodes`

Load image from external URL.

```typescript
{
  type: "wait-for-url",
  params: {
    timeout: 30000,
  },
}
```

**Use Cases**:
- Process remote images
- Third-party image sources
- API-provided content

## Node Comparison

| Node | Speed | Cost | Backend |
|------|-------|------|---------|
| Resize (Sharp) | 50-100ms | Free | Node.js |
| Resize (Photon) | 5-10ms | Free | Edge |
| Optimize | 100-200ms | Free | Sharp/Photon |
| Remove BG | 5-15s | $0.001 | AI/Replicate |
| Upscale | 10-20s | $0.01 | AI/Replicate |
| Describe | 10-20ms | Free | Sharp |
| Merge | Instant | Free | Memory |
| Conditional | Instant | Free | Memory |
| Multiplex | Instant | Free | Memory |
| Zip | ~100-200ms | Free | CPU |

## Architecture Patterns

### Pattern 1: Responsive Images

Create multiple sizes for different devices:

```
Input → Multiplex (3 outputs)
        ├─ Resize 400×300 (mobile)
        ├─ Resize 800×600 (tablet)
        └─ Resize 1200×900 (desktop)
        → Output
```

### Pattern 2: Smart Routing

Route based on file type:

```
Input → Conditional (mimeType contains "image"?)
        ├─ YES: Resize + Optimize → S3
        └─ NO: Archive → Long-term storage
        → Output
```

### Pattern 3: Multi-Destination

Same image to multiple backends:

```
Input → Multiplex (2 outputs)
        ├─ S3 (primary)
        └─ GCS (backup)
        → Output
```

### Pattern 4: Batch Archiving

Multiple files to archive:

```
File 1 ┐
File 2 ├─ Merge (batch) → Zip → S3 → Output
File 3 ┘
```

### Pattern 5: AI Enhancement

Product image processing:

```
Input → Remove BG → Upscale → Optimize → S3 → Output
        (clean)    (quality) (size)
```

## Selection Guide

### Choose Sharp (Node.js) When

- Running on Node.js servers
- Speed critical (sub-100ms)
- Cost sensitive (free)
- Simple operations
- Self-hosted preference

**Best For**: Node.js/Fastify/Express servers

### Choose Photon (Edge) When

- Using Cloudflare Workers
- Global users
- Need instant response
- Value simplicity
- Built-in Workers benefit

**Best For**: Cloudflare Workers deployments

### Choose Replicate (AI) When

- Need AI capabilities
- Value accuracy over speed
- Budget allows per-request cost
- Advanced operations
- Batch processing acceptable

**Best For**: E-commerce, creative, professional use cases

## Performance Benchmarks

### Resize Performance
| Size | Sharp | Photon |
|------|-------|--------|
| 1MB | 50ms | 5ms |
| 5MB | 150ms | 10ms |
| 10MB | 250ms | 15ms |

### Format Conversion
| Operation | Time | Size Reduction |
|-----------|------|----------------|
| JPEG→WebP | 100ms | 30-40% |
| JPEG→AVIF | 150ms | 50-60% |
| PNG→WebP | 80ms | 20-30% |

### AI Operations
| Operation | Time | Cost |
|-----------|------|------|
| Remove BG | 5-15s | $0.002 |
| Upscale 2x | 10s | $0.02 |
| Upscale 4x | 20s | $0.05 |

## Configuration Examples

### E-Commerce Flow

```typescript
{
  nodes: [
    { id: "input", type: "input" },
    // Clean background for product
    { id: "bg", type: "remove-background", params: { model: "rembg" } },
    // Create variants
    { id: "split", type: "multiplex", params: { outputCount: 3 } },
    { id: "thumb", type: "resize", params: { width: 200, height: 200, fit: "cover" } },
    { id: "medium", type: "resize", params: { width: 600, height: 600, fit: "contain" } },
    { id: "full", type: "optimize", params: { quality: 90, format: "webp" } },
    // Store
    { id: "s3", type: "s3" },
    { id: "output", type: "output" },
  ],
}
```

### Content Delivery Flow

```typescript
{
  nodes: [
    { id: "input", type: "input" },
    // Multi-destination
    { id: "split", type: "multiplex", params: { outputCount: 2 } },
    // CDN + Backup
    { id: "cdn", type: "cloudflare", params: { zone: "primary" } },
    { id: "backup", type: "gcs", params: { bucket: "backup" } },
    { id: "output", type: "output" },
  ],
}
```

## Best Practices

1. **Order Matters**: Describe → Route → Process → Store
2. **Quality Balance**: 85 quality is optimal for most cases
3. **Format Selection**: WebP for modern browsers, JPEG for compatibility
4. **Size Strategy**:
   - Thumbnails: 200×200
   - Previews: 600×600
   - Full: 1200×1200
5. **Error Handling**: Always have fallback paths

## Related Packages

- [@uploadista/flow-utility-nodes](./utility/nodes/README.md)
- [@uploadista/flow-utility-zipjs](./utility/zipjs/README.md)
- [@uploadista/flow-images-nodes](./images/nodes/README.md)
- [@uploadista/flow-images-sharp](./images/sharp/README.md)
- [@uploadista/flow-images-photon](./images/photon/README.md)
- [@uploadista/flow-images-replicate](./images/replicate/README.md)

## See Also

- [Server Setup Guide](../../SERVER_SETUP.md) - Flow integration
- [Core Flow Types](../core/flow) - Flow interfaces
