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
