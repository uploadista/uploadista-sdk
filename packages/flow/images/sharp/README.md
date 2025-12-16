# @uploadista/flow-images-sharp

Sharp-based image processing for Uploadista flows. High-performance image operations on Node.js servers.

## Overview

Sharp provides fast, production-grade image processing:

- **Resizing**: Scale images with smart cropping
- **Optimization**: Reduce size while preserving quality
- **Format Conversion**: Convert between formats (JPEG, PNG, WebP, AVIF)
- **Effects**: Blur, rotate, extract regions
- **Metadata**: Extract EXIF and image information

Perfect for Node.js and Fastify/Express servers.

## Installation

```bash
npm install @uploadista/flow-images-sharp
# or
pnpm add @uploadista/flow-images-sharp
```

Note: Sharp is bundled as a dependency, no separate installation required.

### Prerequisites

- Node.js 18+
- libvips (usually installed with sharp)

## Quick Start

```typescript
import { imagePlugin } from "@uploadista/flow-images-sharp";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const plugin = yield* imagePlugin;

  // Resize image
  const resized = yield* plugin.resize(inputBytes, {
    width: 800,
    height: 600,
    fit: "cover",
  });

  // Optimize
  const optimized = yield* plugin.optimize(inputBytes, {
    quality: 85,
    format: "webp",
  });
});

Effect.runSync(program.pipe(Effect.provide(imagePlugin)));
```

## Features

- ✅ **Fast Processing**: libvips backend (10x faster than ImageMagick)
- ✅ **Multiple Formats**: JPEG, PNG, WebP, AVIF, TIFF, GIF
- ✅ **Smart Resizing**: Multiple fit strategies
- ✅ **Metadata Extraction**: EXIF and image properties
- ✅ **Effects**: Blur, sharpen, normalize
- ✅ **Streaming**: Memory-efficient processing

## API Reference

### Main Exports

#### `imagePlugin: Layer<ImagePlugin>`

Pre-configured Sharp image processing layer.

```typescript
import { imagePlugin } from "@uploadista/flow-images-sharp";

const layer = imagePlugin;
```

### Available Operations

#### `resize(input, options): Effect<Uint8Array>`

Scale image to dimensions.

```typescript
interface ResizeOptions {
  width?: number;
  height?: number;
  fit: "cover" | "contain" | "fill";
}

const resized = yield* plugin.resize(imageBytes, {
  width: 800,
  height: 600,
  fit: "cover",
});
```

#### `optimize(input, options): Effect<Uint8Array>`

Compress and convert image.

```typescript
interface OptimizeOptions {
  quality: 1-100;
  format: "jpeg" | "png" | "webp" | "avif";
}

const optimized = yield* plugin.optimize(imageBytes, {
  quality: 85,
  format: "webp",
});
```

## Flow Configuration

### Basic Resize

```typescript
{
  nodes: [
    { id: "input", type: "input" },
    {
      id: "resize",
      type: "resize",
      params: { width: 1200, height: 800, fit: "cover" },
    },
    { id: "store", type: "s3" },
    { id: "output", type: "output" },
  ],
}
```

### Multi-Size Variants

```typescript
{
  nodes: [
    { id: "input", type: "input" },
    {
      id: "split",
      type: "multiplex",
      params: { outputCount: 3 },
    },
    {
      id: "thumb",
      type: "resize",
      params: { width: 200, height: 200, fit: "cover" },
    },
    {
      id: "medium",
      type: "resize",
      params: { width: 800, height: 600, fit: "contain" },
    },
    {
      id: "full",
      type: "optimize",
      params: { quality: 90, format: "webp" },
    },
    { id: "store", type: "s3" },
    { id: "output", type: "output" },
  ],
}
```

## Examples

### Example 1: Thumbnail Generation

```typescript
const flow = {
  nodes: [
    { id: "input", type: "input" },
    {
      id: "thumbnail",
      type: "resize",
      params: { width: 200, height: 200, fit: "cover" },
    },
    {
      id: "optimize",
      type: "optimize",
      params: { quality: 80, format: "webp" },
    },
    { id: "s3", type: "s3", params: { prefix: "thumbnails/" } },
    { id: "output", type: "output" },
  ],
  edges: [
    { from: "input", to: "thumbnail" },
    { from: "thumbnail", to: "optimize" },
    { from: "optimize", to: "s3" },
    { from: "s3", to: "output" },
  ],
};
```

### Example 2: Responsive Images

```typescript
const responsiveFlow = {
  nodes: [
    { id: "input", type: "input" },
    {
      id: "split",
      type: "multiplex",
      params: { outputCount: 4 },
    },
    // Mobile
    {
      id: "mobile",
      type: "resize",
      params: { width: 400, height: 300, fit: "cover" },
    },
    // Tablet
    {
      id: "tablet",
      type: "resize",
      params: { width: 800, height: 600, fit: "contain" },
    },
    // Desktop
    {
      id: "desktop",
      type: "resize",
      params: { width: 1200, height: 900, fit: "cover" },
    },
    // High-DPI
    {
      id: "retina",
      type: "resize",
      params: { width: 2400, height: 1800, fit: "cover" },
    },
    { id: "s3", type: "s3" },
    { id: "output", type: "output" },
  ],
};
```

### Example 3: Format Conversion

```typescript
const conversionFlow = {
  nodes: [
    { id: "input", type: "input" },
    {
      id: "convert",
      type: "optimize",
      params: { quality: 85, format: "webp" },
    },
    { id: "s3", type: "s3" },
    { id: "output", type: "output" },
  ],
};
```

## Performance

| Operation | Time (1MB image) |
|-----------|-----------------|
| Resize to 800x600 | ~50-100ms |
| Optimize (WebP) | ~100-200ms |
| Convert JPEG→WebP | ~150-250ms |
| Extract metadata | ~10-20ms |

Performance scales linearly with image size.

## Best Practices

### 1. Choose Right Fit Strategy

```typescript
// cover: Crop to fill (best for thumbnails)
{ fit: "cover" }

// contain: Fit inside, preserve aspect (best for previews)
{ fit: "contain" }

// fill: Stretch to fill (avoid unless needed)
{ fit: "fill" }
```

### 2. Optimize Quality by Format

```typescript
// JPEG: 80-85 quality (good balance)
{ quality: 85, format: "jpeg" }

// WebP: 80-90 quality (better compression)
{ quality: 85, format: "webp" }

// AVIF: 75-80 quality (excellent compression)
{ quality: 80, format: "avif" }
```

### 3. Create Multiple Sizes

```typescript
// Mobile, tablet, desktop
[
  { width: 400 },
  { width: 800 },
  { width: 1200 },
  { width: 2400 }, // @2x for retina
]
```

## Deployment

### Docker

```dockerfile
FROM node:18-alpine

# Sharp needs libvips
RUN apk add --no-cache vips-dev

WORKDIR /app
COPY . .
RUN npm ci --omit=dev && npm run build

CMD ["node", "dist/server.js"]
```

### Express Server

```typescript
import { imagePlugin } from "@uploadista/flow-images-sharp";

app.post("/resize", async (req, res) => {
  const imageBytes = req.body; // image data

  const program = Effect.gen(function* () {
    const plugin = yield* imagePlugin;
    return yield* plugin.resize(imageBytes, {
      width: 800,
      height: 600,
      fit: "cover",
    });
  });

  const resized = await Effect.runPromise(
    program.pipe(Effect.provide(imagePlugin))
  );
  res.send(Buffer.from(resized));
});
```

## Troubleshooting

### "Cannot find module 'sharp'"

Install sharp:
```bash
npm install sharp
```

### "libvips not found"

Install system dependency:
```bash
# macOS
brew install vips

# Ubuntu
apt-get install libvips-dev

# Alpine
apk add vips-dev
```

### Out of Memory

Sharp processes images in memory. For large files:

```typescript
// Limit by reducing quality/format
{ quality: 60, format: "jpeg" }

// Or pre-resize first
const preResized = yield* plugin.resize(input, { width: 4000 });
const final = yield* plugin.optimize(preResized, { quality: 85 });
```

## Related Packages

- [@uploadista/flow-images-nodes](../nodes) - Base image types
- [@uploadista/flow-images-photon](../photon) - Edge processing
- [@uploadista/flow-utility-zipjs](../../utility/zipjs) - Archive
- [@uploadista/server](../../servers/server) - Upload server

## License

See [LICENSE](../../../LICENSE) in the main repository.

## See Also

- [Sharp Documentation](https://sharp.pixelplumbing.com/) - Official Sharp docs
- [FLOW_NODES.md](../FLOW_NODES.md) - All available nodes
- [Photon Node](../photon/README.md) - Edge alternative
