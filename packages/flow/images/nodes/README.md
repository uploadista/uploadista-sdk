# @uploadista/flow-images-nodes

Base image processing nodes for Uploadista flows. Provides foundational image operations.

## Overview

Base image nodes define interfaces and common operations:

- **Image Descriptions**: Extract metadata from images
- **Optimization**: Basic compression and format conversion
- **Background Removal**: Remove image backgrounds
- **Resizing**: Scale images
- **URL Resolution**: Load images from URLs

## Installation

```bash
npm install @uploadista/flow-images-nodes
# or
pnpm add @uploadista/flow-images-nodes
```

## Node Types

### Describe Image

Extract image metadata.

```typescript
{
  type: "describe-image",
  params: {}
}
```

Output: Image metadata (dimensions, format, etc)

### Optimize

Compress and convert images.

```typescript
{
  type: "optimize",
  params: {
    quality: 85,        // 1-100
    format: "webp"      // jpeg, png, webp, avif
  }
}
```

### Remove Background

Remove image backgrounds.

```typescript
{
  type: "remove-background",
  params: {
    padding: 0,
    format: "png"
  }
}
```

### Resize

Scale images to dimensions.

```typescript
{
  type: "resize",
  params: {
    width: 800,
    height: 600,
    fit: "cover"        // cover, contain, fill
  }
}
```

### Wait for URL

Load image from URL.

```typescript
{
  type: "wait-for-url",
  params: {
    timeout: 30000
  }
}
```

## Use Cases

- Extract metadata for indexing
- Normalize image formats
- Create responsive variants
- Remove backgrounds for product images
- Load external images into pipeline

## Related Packages

- [@uploadista/flow-images-sharp](../sharp) - Sharp implementation (Node.js)
- [@uploadista/flow-images-photon](../photon) - Cloudflare Photon (edge)
- [@uploadista/flow-images-replicate](../replicate) - AI operations
- [@uploadista/server](../../servers/server) - Upload server

## License

See [LICENSE](../../../LICENSE) in the main repository.

## See Also

- [FLOW_NODES.md](../FLOW_NODES.md) - All available nodes
- [Sharp Node](../sharp/README.md) - Node.js image processing
- [Photon Node](../photon/README.md) - Edge image processing
