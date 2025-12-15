# @uploadista/flow-images-nodes

Image processing nodes for Uploadista flows. Provides resizing, optimization, transformations, and AI-powered operations.

## Installation

```bash
npm install @uploadista/flow-images-nodes
# or
pnpm add @uploadista/flow-images-nodes
```

## Quick Start

```typescript
import {
  createResizeNode,
  createOptimizeNode,
  createTransformImageNode,
  createRemoveBackgroundNode,
  createDescribeImageNode,
} from "@uploadista/flow-images-nodes";
```

## Node Types

### Resize Node

Scale images to specific dimensions.

```typescript
import { createResizeNode } from "@uploadista/flow-images-nodes";

// Resize to specific dimensions
const resizeNode = yield* createResizeNode("resize-1", {
  width: 800,
  height: 600,
  fit: "cover",
});

// Resize width only, maintain aspect ratio
const widthOnlyNode = yield* createResizeNode("resize-2", {
  width: 1200,
  fit: "contain",
});

// With streaming mode for large files
const streamingNode = yield* createResizeNode("resize-3", {
  width: 800,
  height: 600,
  fit: "cover",
}, {
  mode: "streaming",
  naming: { mode: "auto" },
});
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `width` | `number` | No* | Target width in pixels |
| `height` | `number` | No* | Target height in pixels |
| `fit` | `"contain" \| "cover" \| "fill"` | Yes | How the image fits within dimensions |

*At least one of `width` or `height` must be specified.

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | `"auto" \| "buffered" \| "streaming"` | `"auto"` | Processing mode |
| `keepOutput` | `boolean` | `false` | Keep output in flow results |
| `naming` | `FileNamingConfig` | - | File naming configuration |

### Optimize Node

Compress and convert image formats.

```typescript
import { createOptimizeNode } from "@uploadista/flow-images-nodes";

// Convert to WebP with quality 80
const optimizeNode = yield* createOptimizeNode("optimize-1", {
  quality: 80,
  format: "webp",
});

// Maximum compression with AVIF
const avifNode = yield* createOptimizeNode("optimize-2", {
  quality: 75,
  format: "avif",
});

// High quality JPEG for compatibility
const jpegNode = yield* createOptimizeNode("optimize-3", {
  quality: 90,
  format: "jpeg",
}, {
  naming: { mode: "auto" },
});
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `quality` | `number` (0-100) | Yes | Image quality percentage |
| `format` | `"jpeg" \| "webp" \| "png" \| "avif"` | Yes | Output image format |

### Transform Image Node

Apply multiple transformations in sequence.

```typescript
import { createTransformImageNode } from "@uploadista/flow-images-nodes";

// Chain multiple transformations
const transformNode = yield* createTransformImageNode("transform-1", {
  transformations: [
    { type: "resize", width: 800, height: 600, fit: "cover" },
    { type: "brightness", value: 10 },
    { type: "sharpen" },
  ],
});

// Add watermark
const watermarkNode = yield* createTransformImageNode("transform-2", {
  transformations: [
    { type: "resize", width: 1200, fit: "contain" },
    {
      type: "watermark",
      imagePath: "https://example.com/watermark.png",
      position: "bottom-right",
      opacity: 0.5,
    },
  ],
});

// Apply filters
const filterNode = yield* createTransformImageNode("transform-3", {
  transformations: [
    { type: "grayscale" },
    { type: "contrast", value: 20 },
  ],
});
```

#### Transformation Types

| Type | Parameters | Description |
|------|------------|-------------|
| `resize` | `width?`, `height?`, `fit` | Resize image |
| `blur` | `sigma` (0.3-1000) | Apply Gaussian blur |
| `rotate` | `angle`, `background?` | Rotate by degrees |
| `flip` | `direction` | Flip horizontal/vertical |
| `grayscale` | - | Convert to grayscale |
| `sepia` | - | Apply sepia tone |
| `brightness` | `value` (-100 to 100) | Adjust brightness |
| `contrast` | `value` (-100 to 100) | Adjust contrast |
| `sharpen` | `sigma?` | Apply sharpening |
| `watermark` | `imagePath`, `position`, `opacity` | Add watermark |
| `logo` | `imagePath`, `position`, `scale` | Add logo overlay |
| `text` | `text`, `position`, `fontSize`, `color` | Add text overlay |

### Remove Background Node

AI-powered background removal.

```typescript
import { createRemoveBackgroundNode } from "@uploadista/flow-images-nodes";

// Remove background with default settings
const removeBgNode = yield* createRemoveBackgroundNode("remove-bg-1");

// With custom credential and naming
const customNode = yield* createRemoveBackgroundNode("remove-bg-2", {
  credentialId: "my-replicate-credential",
  naming: { mode: "auto" },
});
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `credentialId` | `string` | No | - | AI service credential ID |
| `keepOutput` | `boolean` | No | `false` | Keep output in flow results |
| `naming` | `FileNamingConfig` | No | - | File naming (auto suffix: `nobg`) |

### Describe Image Node

Extract image description using AI.

```typescript
import { createDescribeImageNode } from "@uploadista/flow-images-nodes";

// Describe image content
const describeNode = yield* createDescribeImageNode("describe-1");

// With custom credential
const customDescribeNode = yield* createDescribeImageNode("describe-2", {
  credentialId: "my-ai-credential",
  keepOutput: true,
});
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `credentialId` | `string` | No | - | AI service credential ID |
| `keepOutput` | `boolean` | No | `false` | Keep output in flow results |

## Streaming Modes

All transform nodes support three processing modes:

| Mode | Description | When to Use |
|------|-------------|-------------|
| `auto` | Selects streaming for files > 1MB | Default, recommended |
| `buffered` | Loads entire file into memory | Small files |
| `streaming` | Processes file as chunks | Large files, memory-constrained |

## Related Packages

- [@uploadista/flow-images-sharp](../sharp) - Sharp implementation (Node.js)
- [@uploadista/flow-images-photon](../photon) - Cloudflare Photon (Edge)
- [@uploadista/flow-images-replicate](../replicate) - AI operations

## License

See [LICENSE](../../../LICENSE) in the main repository.
