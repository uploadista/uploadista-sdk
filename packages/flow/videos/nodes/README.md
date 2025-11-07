# @uploadista/flow-videos-nodes

Video processing nodes for Uploadista Flow. Transform, optimize, and extract metadata from video files in your flows.

## Installation

```bash
npm install @uploadista/flow-videos-nodes @uploadista/flow-videos-ffmpeg
```

## Quick Start

```typescript
import { createFlow } from "@uploadista/core/flow";
import { FFmpegVideoPluginLive } from "@uploadista/flow-videos-ffmpeg";
import {
  createTranscodeNode,
  createResizeNode,
  createThumbnailNode,
} from "@uploadista/flow-videos-nodes";
import { Effect } from "effect";

// Create a video processing flow
const flow = yield* createFlow({
  nodes: [
    // Transcode to WebM with VP9 codec
    yield* createTranscodeNode("transcode-1", {
      format: "webm",
      codec: "vp9",
      videoBitrate: "1000k",
    }),

    // Resize to 720p
    yield* createResizeNode("resize-1", {
      width: 1280,
      height: 720,
      aspectRatio: "keep",
    }),

    // Generate thumbnail at 5 seconds
    yield* createThumbnailNode("thumbnail-1", {
      timestamp: 5,
      format: "jpeg",
      quality: 85,
    }),
  ],
  edges: [
    { from: "input", to: "transcode-1" },
    { from: "transcode-1", to: "resize-1" },
    { from: "resize-1", to: "thumbnail-1" },
    { from: "thumbnail-1", to: "output" },
  ],
});

// Provide FFmpeg plugin layer to run the flow
const result = await Effect.runPromise(
  flowProgram.pipe(Effect.provide(FFmpegVideoPluginLive))
);
```

## Available Nodes

### Transcode Node

Convert between video formats and codecs.

```typescript
import { createTranscodeNode } from "@uploadista/flow-videos-nodes";

const node = yield* createTranscodeNode("transcode-1", {
  format: "mp4", // mp4 | webm | mov | avi
  codec: "h264", // h264 | h265 | vp9 | av1
  videoBitrate: "2M", // Optional
  audioBitrate: "128k", // Optional
  audioCodec: "aac", // Optional: aac | mp3 | opus | vorbis
});
```

### Resize Node

Change video resolution.

```typescript
import { createResizeNode } from "@uploadista/flow-videos-nodes";

const node = yield* createResizeNode("resize-1", {
  width: 1920, // Target width (optional if height specified)
  height: 1080, // Target height (optional if width specified)
  aspectRatio: "keep", // "keep" | "ignore"
  scaling: "bicubic", // "bicubic" | "bilinear" | "lanczos"
});
```

### Trim Node

Extract a segment from the video.

```typescript
import { createTrimNode } from "@uploadista/flow-videos-nodes";

// Using endTime
const node1 = yield* createTrimNode("trim-1", {
  startTime: 10, // Start at 10 seconds
  endTime: 30, // End at 30 seconds
});

// Using duration
const node2 = yield* createTrimNode("trim-2", {
  startTime: 10,
  duration: 20, // 20 seconds duration
});
```

### Thumbnail Node

Generate a preview image from the video.

```typescript
import { createThumbnailNode } from "@uploadista/flow-videos-nodes";

const node = yield* createThumbnailNode("thumbnail-1", {
  timestamp: 15, // Extract frame at 15 seconds
  format: "jpeg", // "jpeg" | "png"
  quality: 85, // 1-100 (JPEG only)
});
```

### Describe Video Node

Extract comprehensive video metadata.

```typescript
import { createDescribeVideoNode } from "@uploadista/flow-videos-nodes";

const node = yield* createDescribeVideoNode("describe-1");

// Metadata stored in file.metadata.videoInfo:
// {
//   duration: 120.5,
//   width: 1920,
//   height: 1080,
//   codec: "h264",
//   format: "mp4",
//   bitrate: 2500000,
//   frameRate: 30,
//   aspectRatio: "16:9",
//   hasAudio: true,
//   audioCodec: "aac",
//   audioBitrate: 128000,
//   size: 37500000
// }
```

## Common Patterns

### Social Media Optimization

```typescript
const flow = yield* createFlow({
  nodes: [
    yield* createResizeNode("resize", {
      width: 1280,
      height: 720,
    }),
    yield* createTranscodeNode("transcode", {
      format: "mp4",
      codec: "h264",
      videoBitrate: "1500k",
      audioBitrate: "128k",
    }),
  ],
  edges: [
    { from: "input", to: "resize" },
    { from: "resize", to: "transcode" },
    { from: "transcode", to: "output" },
  ],
});
```

### Multi-Format Delivery

Use conditional nodes to generate multiple formats:

```typescript
const flow = yield* createFlow({
  nodes: [
    yield* createMultiplexNode("multiplex", { outputs: 2 }),
    yield* createTranscodeNode("mp4", { format: "mp4", codec: "h264" }),
    yield* createTranscodeNode("webm", { format: "webm", codec: "vp9" }),
  ],
  edges: [
    { from: "input", to: "multiplex" },
    { from: "multiplex:0", to: "mp4" },
    { from: "multiplex:1", to: "webm" },
    { from: "mp4", to: "output-mp4" },
    { from: "webm", to: "output-webm" },
  ],
});
```

## Requirements

- Node.js environment (video processing requires FFmpeg binary)
- FFmpeg >= 4.0 installed on the system
- See [@uploadista/flow-videos-ffmpeg](../ffmpeg/README.md) for installation instructions

## License

MIT
