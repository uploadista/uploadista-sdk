# @uploadista/flow-videos-ffmpeg

FFmpeg-based video processing plugin for Uploadista Flow. Provides video transcoding, resizing, trimming, thumbnail generation, and metadata extraction using FFmpeg.

## Installation

```bash
npm install @uploadista/flow-videos-ffmpeg
```

### FFmpeg Installation

This package requires FFmpeg to be installed on your system.

#### macOS

```bash
brew install ffmpeg
```

#### Ubuntu/Debian

```bash
sudo apt-get update
sudo apt-get install ffmpeg
```

#### Docker

```dockerfile
FROM node:20-alpine
RUN apk add --no-cache ffmpeg
```

Verify installation:

```bash
ffmpeg -version
```

## Usage

### Provide the Plugin Layer

```typescript
import { FFmpegVideoPluginLive } from "@uploadista/flow-videos-ffmpeg";
import { Effect } from "effect";

// Provide the FFmpeg plugin to your flow execution
const result = await Effect.runPromise(
  flowProgram.pipe(Effect.provide(FFmpegVideoPluginLive))
);
```

### With Availability Check

```typescript
import { FFmpegVideoPluginLiveWithCheck } from "@uploadista/flow-videos-ffmpeg";

// Checks FFmpeg availability on initialization
const result = await Effect.runPromise(
  flowProgram.pipe(Effect.provide(FFmpegVideoPluginLiveWithCheck))
);
// Logs: "✓ FFmpeg 6.0 detected" or warning if not found
```

## Supported Formats

### Input Formats

- MP4 (MPEG-4)
- WebM (VP8/VP9)
- MOV (QuickTime)
- AVI (Audio Video Interleave)
- MKV (Matroska)
- FLV (Flash Video)

### Output Formats

- MP4 (H.264/AAC) - Most compatible
- WebM (VP9/Opus) - Modern web standard
- MOV (H.264/AAC) - Apple ecosystem
- AVI (various codecs)

### Video Codecs

- **H.264** (`libx264`) - Universal compatibility
- **H.265/HEVC** (`libx265`) - Better compression
- **VP9** (`libvpx-vp9`) - Open-source, good for web
- **AV1** (`libaom-av1`) - Next-gen, best compression

### Audio Codecs

- **AAC** - Standard for MP4
- **Opus** - Modern, efficient
- **MP3** - Legacy compatibility
- **Vorbis** - WebM standard

## Error Handling

The plugin uses typed UploadistaError codes:

- `VIDEO_PROCESSING_FAILED` - Generic processing error
- `INVALID_VIDEO_FORMAT` - Unsupported format
- `CODEC_NOT_SUPPORTED` - Codec unavailable
- `VIDEO_METADATA_EXTRACTION_FAILED` - Cannot read metadata
- `FFMPEG_NOT_INSTALLED` - FFmpeg not found in PATH

```typescript
import { Effect } from "effect";
import { UploadistaError } from "@uploadista/core/errors";

const program = Effect.gen(function* () {
  const videoPlugin = yield* VideoPlugin;
  const result = yield* videoPlugin.transcode(videoBytes, {
    format: "webm",
    codec: "vp9",
  });
  return result;
}).pipe(
  Effect.catchTag("UploadistaError", (error) => {
    if (error.code === "FFMPEG_NOT_INSTALLED") {
      console.error("Please install FFmpeg: https://ffmpeg.org/download.html");
    }
    return Effect.fail(error);
  })
);
```

## Performance Considerations

Video processing is computationally intensive. Approximate processing times (on modern CPU):

| Operation                | 1 min video | 5 min video |
| ------------------------ | ----------- | ----------- |
| Transcode H.264 → WebM   | ~30s        | ~2.5m       |
| Resize 1080p → 720p      | ~15s        | ~1.5m       |
| Thumbnail extraction     | ~2s         | ~2s         |
| Metadata extraction      | <1s         | <1s         |
| Trim (no re-encode)      | ~5s         | ~10s        |

Times vary based on video complexity, codec settings, and hardware.

## Minimum FFmpeg Version

FFmpeg >= 4.0 is required. Check your version:

```bash
ffmpeg -version
```

## Troubleshooting

### FFmpeg not found

**Error**: `FFMPEG_NOT_INSTALLED`

**Solution**: Install FFmpeg and ensure it's in your system PATH.

```bash
# Verify FFmpeg is accessible
which ffmpeg
ffmpeg -version
```

### Codec not supported

**Error**: `CODEC_NOT_SUPPORTED`

**Solution**: Your FFmpeg build may not include all codecs. Install a full FFmpeg build:

```bash
# macOS
brew reinstall ffmpeg --with-all-options

# Ubuntu
sudo apt-get install ffmpeg
```

### Out of memory

**Solution**: Process smaller videos or reduce resolution/bitrate settings.

## License

MIT
