# @uploadista/flow-videos-nodes

Video processing nodes for Uploadista flows. Transcode, resize, trim, and extract metadata from video files.

## Installation

```bash
npm install @uploadista/flow-videos-nodes @uploadista/flow-videos-ffmpeg
# or
pnpm add @uploadista/flow-videos-nodes @uploadista/flow-videos-ffmpeg
```

## Quick Start

```typescript
import {
  createTranscodeVideoNode,
  createVideoResizeNode,
  createVideoThumbnailNode,
  createTrimVideoNode,
  createDescribeVideoNode,
} from "@uploadista/flow-videos-nodes";
```

## Node Types

### Transcode Node

Convert video to different formats and codecs.

```typescript
import { createTranscodeVideoNode } from "@uploadista/flow-videos-nodes";

// Convert to WebM with VP9 codec
const transcodeNode = yield* createTranscodeVideoNode("transcode-1", {
  format: "webm",
  codec: "vp9",
  videoBitrate: "1000k",
});

// Convert to MP4 with H.264 for compatibility
const mp4Node = yield* createTranscodeVideoNode("transcode-2", {
  format: "mp4",
  codec: "h264",
  videoBitrate: "2M",
  audioBitrate: "128k",
  audioCodec: "aac",
});

// With streaming mode for large files
const streamingNode = yield* createTranscodeVideoNode("transcode-3", {
  format: "mp4",
  codec: "h264",
}, {
  mode: "streaming",
  naming: { mode: "auto" },
});
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `format` | `"mp4" \| "webm" \| "mov" \| "avi"` | Yes | Output container format |
| `codec` | `"h264" \| "h265" \| "vp9" \| "av1"` | No | Video codec |
| `videoBitrate` | `string` | No | Video bitrate (e.g., "1000k", "2M") |
| `audioBitrate` | `string` | No | Audio bitrate (e.g., "128k", "192k") |
| `audioCodec` | `"aac" \| "mp3" \| "opus" \| "vorbis"` | No | Audio codec |

### Resize Video Node

Change video resolution.

```typescript
import { createVideoResizeNode } from "@uploadista/flow-videos-nodes";

// Resize to 720p
const resizeNode = yield* createVideoResizeNode("resize-1", {
  width: 1280,
  height: 720,
  aspectRatio: "keep",
  scaling: "bicubic",
});

// Resize to 1080p width, auto height
const widthOnlyNode = yield* createVideoResizeNode("resize-2", {
  width: 1920,
  aspectRatio: "keep",
});
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `width` | `number` | No* | Target width in pixels |
| `height` | `number` | No* | Target height in pixels |
| `aspectRatio` | `"keep" \| "ignore"` | No | Aspect ratio handling mode |
| `scaling` | `"bicubic" \| "bilinear" \| "lanczos"` | No | Scaling algorithm quality |

*At least one of `width` or `height` must be specified.

### Trim Video Node

Extract a segment from a video.

```typescript
import { createTrimVideoNode } from "@uploadista/flow-videos-nodes";

// Extract segment using endTime
const trimNode = yield* createTrimVideoNode("trim-1", {
  startTime: 10,
  endTime: 30,
});

// Extract segment using duration
const durationNode = yield* createTrimVideoNode("trim-2", {
  startTime: 10,
  duration: 20,
});
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `startTime` | `number` | Yes | Start time in seconds |
| `endTime` | `number` | No | End time in seconds |
| `duration` | `number` | No | Duration in seconds (alternative to endTime) |

**Note:** Cannot specify both `endTime` and `duration`.

### Thumbnail Node

Generate a preview image from the video.

```typescript
import { createVideoThumbnailNode } from "@uploadista/flow-videos-nodes";

// Extract frame at 15 seconds as JPEG
const thumbnailNode = yield* createVideoThumbnailNode("thumbnail-1", {
  timestamp: 15,
  format: "jpeg",
  quality: 85,
});

// Extract frame as PNG
const pngThumbNode = yield* createVideoThumbnailNode("thumbnail-2", {
  timestamp: 5,
  format: "png",
});
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `timestamp` | `number` | Yes | - | Time position in seconds |
| `format` | `"jpeg" \| "png"` | No | `"jpeg"` | Output image format |
| `quality` | `number` (1-100) | No | - | JPEG quality (only for jpeg format) |

### Describe Video Node

Extract comprehensive video metadata.

```typescript
import { createDescribeVideoNode } from "@uploadista/flow-videos-nodes";

// Extract video metadata
const describeNode = yield* createDescribeVideoNode("describe-1");

// Metadata stored in file.metadata.videoInfo
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `keepOutput` | `boolean` | No | `false` | Keep output in flow results |

**Output Metadata:**
```json
{
  "duration": 120.5,
  "width": 1920,
  "height": 1080,
  "codec": "h264",
  "format": "mp4",
  "bitrate": 2500000,
  "frameRate": 30,
  "aspectRatio": "16:9",
  "hasAudio": true,
  "audioCodec": "aac",
  "audioBitrate": 128000,
  "size": 37500000
}
```

## Streaming Modes

All video transform nodes support three processing modes:

| Mode | Description | When to Use |
|------|-------------|-------------|
| `auto` | Selects streaming for files > 10MB | Default, recommended |
| `buffered` | Loads entire file into memory | Small files |
| `streaming` | Processes file as chunks | Large files, memory-constrained |

## Requirements

- Node.js environment (video processing requires FFmpeg binary)
- FFmpeg >= 4.0 installed on the system
- See [@uploadista/flow-videos-ffmpeg](../ffmpeg/README.md) for installation instructions

## License

MIT
