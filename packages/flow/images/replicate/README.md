# @uploadista/flow-images-replicate

AI-powered image operations for Uploadista flows. Use Replicate's ML models for advanced image manipulation.

## Overview

Replicate integration enables AI image operations:

- **Background Removal**: AI-powered background removal
- **Upscaling**: Enhance image resolution
- **Style Transfer**: Apply artistic styles
- **Custom Models**: Use any Replicate model
- **Serverless**: No GPU infrastructure needed

Perfect for advanced image processing workflows.

## Installation

```bash
npm install @uploadista/flow-images-replicate
# or
pnpm add @uploadista/flow-images-replicate
```

### Prerequisites

- Replicate API token (get from replicate.com)
- Node.js 18+

## Quick Start

```typescript
import { imageAiPlugin } from "@uploadista/flow-images-replicate";

const flow = {
  nodes: [
    { id: "input", type: "input" },
    {
      id: "remove-bg",
      type: "background-removal",
      params: { model: "rembg" },
    },
    { id: "s3", type: "s3" },
    { id: "output", type: "output" },
  ],
};
```

## Features

- ✅ **AI Models**: Background removal, upscaling, effects
- ✅ **No GPU Needed**: Replicate handles compute
- ✅ **Serverless**: Pay per request
- ✅ **Webhook Support**: Async processing
- ✅ **Custom Models**: Use any Replicate model

## Node Types

### Background Removal

```typescript
{
  type: "remove-background",
  params: {
    model: "rembg",  // AI model
    returnFormat: "png",
  },
}
```

### Upscaling

```typescript
{
  type: "upscale",
  params: {
    scale: 4,  // 2x, 4x upscaling
    model: "real-esrgan",
  },
}
```

### Style Transfer

```typescript
{
  type: "style-transfer",
  params: {
    style: "oil-painting",
    model: "arbitrary-style-transfer",
  },
}
```

## Configuration

Set API token:

```typescript
export const config = {
  replicate: {
    apiToken: process.env.REPLICATE_API_TOKEN,
  },
};
```

## Use Cases

- Remove backgrounds from product photos
- Upscale low-resolution images
- Apply artistic effects
- Custom ML image processing
- Batch AI operations

## Examples

### Product Image Processing

```typescript
const productFlow = {
  nodes: [
    { id: "input", type: "input" },
    {
      id: "remove-bg",
      type: "remove-background",
      params: { model: "rembg" },
    },
    {
      id: "upscale",
      type: "upscale",
      params: { scale: 2, model: "real-esrgan" },
    },
    { id: "s3", type: "s3", params: { bucket: "products" } },
    { id: "output", type: "output" },
  ],
  edges: [
    { from: "input", to: "remove-bg" },
    { from: "remove-bg", to: "upscale" },
    { from: "upscale", to: "s3" },
    { from: "s3", to: "output" },
  ],
};
```

### Creative Effects

```typescript
const creativeFlow = {
  nodes: [
    { id: "input", type: "input" },
    {
      id: "style",
      type: "style-transfer",
      params: {
        style: "oil-painting",
        model: "arbitrary-style-transfer",
      },
    },
    { id: "upscale", type: "upscale", params: { scale: 2 } },
    { id: "s3", type: "s3" },
    { id: "output", type: "output" },
  ],
};
```

## Performance

| Operation | Time |
|-----------|------|
| Background removal | 5-15s |
| Upscaling (2x) | 10-20s |
| Style transfer | 15-30s |
| Async webhook | Variable |

All operations asynchronous via webhook.

## Cost

Replicate pricing (varies by model):
- Background removal: ~$0.001-0.002 per image
- Upscaling: ~$0.01-0.05 per image
- Style transfer: ~$0.02-0.10 per image

## Best Practices

### 1. Async Processing

```typescript
// Use webhooks for long-running AI ops
{
  type: "remove-background",
  params: {
    model: "rembg",
    webhook: "https://yourapi.com/callbacks",
    async: true,
  },
}
```

### 2. Batch Operations

```typescript
// Process multiple images in parallel
const batch = [image1, image2, image3];
const results = yield* Effect.all(
  batch.map((img) => removeBackground(img))
);
```

### 3. Error Handling

```typescript
// AI models may fail or timeout
yield* removeBackground(image).pipe(
  Effect.catch((error) => {
    // Fallback to standard processing
    return standardBackgroundRemoval(image);
  })
);
```

## Related Packages

- [@uploadista/flow-images-nodes](../nodes) - Base types
- [@uploadista/flow-images-sharp](../sharp) - Standard processing
- [@uploadista/server](../../servers/server) - Upload server

## License

See [LICENSE](../../../LICENSE) in the main repository.

## See Also

- [Replicate Documentation](https://replicate.com/docs) - Replicate API
- [FLOW_NODES.md](../FLOW_NODES.md) - All available nodes
- [Replicate Models](https://replicate.com/explore) - Available AI models
