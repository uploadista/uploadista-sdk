# @uploadista/flow-images-photon

Cloudflare Photon image processing for Uploadista flows. Edge-deployed image transformations with global performance.

## Overview

Photon provides serverless image processing at Cloudflare edge:

- **Edge Location**: Process images at 300+ edge locations
- **Global Performance**: Sub-10ms processing globally
- **No Infrastructure**: Serverless image operations
- **Multiple Formats**: JPEG, PNG, WebP, AVIF
- **Effects**: Resize, crop, blur, sharpen, filter

Perfect for Cloudflare Workers-based upload servers.

## Installation

```bash
npm install @uploadista/flow-images-photon
# or
pnpm add @uploadista/flow-images-photon
```

### Prerequisites

- Cloudflare Workers project
- Photon API access (included with Workers)

## Quick Start

```typescript
import { imagePluginServerless } from "@uploadista/flow-images-photon";

export default {
  async fetch(request: Request, env: any) {
    // Photon processor available globally
    // Images processed at edge
  },
};
```

## Features

- ✅ **Global Edge**: 300+ locations worldwide
- ✅ **Instant**: No cold starts, ~10ms latency
- ✅ **Serverless**: No servers to manage
- ✅ **Auto-Scaling**: Handles any traffic
- ✅ **Multiple Formats**: Automatic optimization

## Transformation Support

### Supported vs Unsupported Transformations

Photon supports most common image transformations but has limitations compared to Sharp. Use this matrix to determine which plugin to use for your workflow:

| Transformation | Photon Support | Sharp Support | Notes |
|---------------|----------------|---------------|-------|
| **Basic Transformations** |
| Resize | ✅ Full | ✅ Full | Both support width, height, fit modes |
| Blur | ✅ Full | ✅ Full | Gaussian blur with sigma parameter |
| Rotate | ❌ Not supported | ✅ Full | Use Sharp for rotation |
| Flip | ✅ Full | ✅ Full | Horizontal and vertical flip |
| **Filter Transformations** |
| Grayscale | ✅ Full | ✅ Full | Convert to grayscale |
| Sepia | ✅ Full | ✅ Full | Apply sepia tone |
| Brightness | ✅ Full | ✅ Full | Adjust brightness (-100 to +100) |
| Contrast | ✅ Full | ✅ Full | Adjust contrast (-100 to +100) |
| **Effect Transformations** |
| Sharpen | ✅ Full | ✅ Full | Image sharpening |
| **Advanced Transformations** |
| Watermark | ❌ Not supported | ✅ Full | Use Sharp for watermarks |
| Logo overlay | ❌ Not supported | ✅ Full | Use Sharp for logo overlays |
| Text overlay | ❌ Not supported | ✅ Full | Use Sharp for text rendering |

### Unsupported Transformations

When using the `transform` method with unsupported transformation types, Photon will return a clear error:

```typescript
// This will fail with Photon plugin
const result = await imagePlugin.transform(imageBytes, {
  type: 'watermark',
  imagePath: '/watermark.png',
  position: 'bottom-right',
  opacity: 0.5
});
// Error: "Photon plugin does not support 'watermark'. Use sharp plugin or remove this transformation."
```

### Recommendation

- **Use Photon when**: You need edge deployment, global performance, and only use basic transformations (resize, blur, flip, filters)
- **Use Sharp when**: You need advanced features (watermarks, logos, text, rotation) or running in Node.js environment
- **Hybrid approach**: Use both! Deploy Photon for fast basic operations at edge, and Sharp for advanced transformations in your origin server

## Node Types

### Resize (Edge)

```typescript
{
  type: "resize",
  params: {
    width: 800,
    height: 600,
    fit: "cover",
  },
}
```

### Optimize (Edge)

```typescript
{
  type: "optimize",
  params: {
    quality: 85,
    format: "webp",
  },
}
```

## Use Cases

- Responsive images globally
- Real-time thumbnail generation
- Format conversion at edge
- Global CDN integration
- Instant image optimization

## Examples

### Global Responsive Images

```typescript
const responsiveFlow = {
  nodes: [
    { id: "input", type: "input" },
    { id: "split", type: "multiplex", params: { outputCount: 3 } },
    {
      id: "mobile",
      type: "resize",
      params: { width: 400, height: 300, fit: "cover" },
    },
    {
      id: "tablet",
      type: "resize",
      params: { width: 800, height: 600, fit: "contain" },
    },
    {
      id: "desktop",
      type: "resize",
      params: { width: 1200, height: 900, fit: "cover" },
    },
    { id: "r2", type: "r2-store" },
    { id: "output", type: "output" },
  ],
};
```

## Performance

| Operation | Latency |
|-----------|---------|
| Resize to 800x600 | ~5-10ms |
| Optimize (WebP) | ~10-15ms |
| Global delivery | ~50-100ms (edge+network) |

Processing at edge location closest to user.

## Limitations

- **Photon Features**: Subset of Sharp (most common ops supported)
- **Size Limits**: 50MB recommended max
- **API Rate**: Subject to Cloudflare quotas

## Related Packages

- [@uploadista/flow-images-nodes](../nodes) - Base types
- [@uploadista/flow-images-sharp](../sharp) - Node.js alternative
- [@uploadista/adapters-hono](../../servers/adapters-hono) - Hono integration
- [@uploadista/server](../../servers/server) - Upload server

## License

See [LICENSE](../../../LICENSE) in the main repository.

## See Also

- [Cloudflare Photon](https://developers.cloudflare.com/workers/platform/pricing/plans/) - Official Photon
- [FLOW_NODES.md](../FLOW_NODES.md) - All available nodes
- [Sharp Node](../sharp/README.md) - Node.js alternative
