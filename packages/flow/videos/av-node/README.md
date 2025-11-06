# @uploadista/flow-videos-av-node

Modern FFmpeg-based video processing plugin for Uploadista Flow using node-av. Provides video transcoding, resizing, trimming, thumbnail generation, and metadata extraction with native FFmpeg bindings.

## Features

- **No System Dependencies**: node-av includes prebuilt FFmpeg binaries - no system installation required
- **TypeScript Native**: Full type safety with modern TypeScript support
- **Modern API**: Uses native async/await and AsyncIterators
- **Memory Efficient**: Automatic resource management with `using` declarations
- **Cross-Platform**: Works on Windows, macOS, and Linux out of the box

## Installation

```bash
npm install @uploadista/flow-videos-av-node
```

No additional dependencies or system packages required - FFmpeg binaries are included with node-av.

## Usage

### Provide the Plugin Layer

```typescript
import { AVNodeVideoPluginLive } from "@uploadista/flow-videos-av-node";
import { Effect } from "effect";

// Provide the node-av plugin to your flow execution
const result = await Effect.runPromise(
  flowProgram.pipe(Effect.provide(AVNodeVideoPluginLive))
);
```

### With Availability Check

```typescript
import { AVNodeVideoPluginWithCheck } from "@uploadista/flow-videos-av-node";

// Checks node-av availability on initialization
const result = await Effect.runPromise(
  flowProgram.pipe(Effect.provide(AVNodeVideoPluginWithCheck))
);
// Logs: "✓ node-av 3.x detected" or warning if not found
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

- **H.264** (`h264`) - Universal compatibility
- **H.265/HEVC** (`hevc`) - Better compression
- **VP9** (`vp9`) - Open-source, good for web
- **AV1** (`av1`) - Next-gen, best compression

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
    if (error.code === "VIDEO_PROCESSING_FAILED") {
      console.error("Video processing failed:", error.message);
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
| Trim (with re-encode)    | ~10s        | ~50s        |

Times vary based on video complexity, codec settings, and hardware.

## Advantages over fluent-ffmpeg

- **Modern**: node-av is actively maintained with TypeScript support
- **No System Dependencies**: Includes prebuilt FFmpeg binaries
- **Type Safe**: Full TypeScript definitions and modern API
- **Memory Efficient**: Better resource management with automatic cleanup
- **Performance**: Direct FFmpeg bindings without wrapper overhead

## Current Limitations

This is an initial implementation focusing on core functionality:

- **Resize Quality**: Currently uses encoder-based resizing. For production use, consider adding FilterAPI support for better quality scaling
- **Frame Extraction**: Extracts frames as MJPEG or PNG. Additional format support can be added
- **Hardware Acceleration**: Not yet implemented, but node-av supports it via HardwareContext

## Roadmap

Future improvements planned:

1. **FilterAPI Integration**: Add support for high-quality video filters (scale, crop, overlay, etc.)
2. **Hardware Acceleration**: GPU-accelerated encoding/decoding support
3. **Additional Formats**: Support for more image formats in frame extraction
4. **Stream Processing**: Direct stream input/output without temporary files
5. **Progress Callbacks**: Real-time progress reporting for long operations

## Troubleshooting

### Import Error

**Error**: Cannot find module 'node-av'

**Solution**: Ensure node-av is installed:

```bash
npm install node-av
```

### TypeScript Errors

**Error**: TypeScript compilation errors

**Solution**: node-av requires modern TypeScript features. Ensure you're using TypeScript 5.2+:

```bash
npm install -D typescript@latest
```

## Comparison with @uploadista/flow-videos-ffmpeg

| Feature | av-node (this package) | ffmpeg (fluent-ffmpeg) |
|---------|----------------------|------------------------|
| System Dependencies | ❌ None (bundled) | ✅ Requires FFmpeg install |
| Maintenance | ✅ Active | ⚠️ Deprecated |
| TypeScript Support | ✅ Native | ⚠️ Via @types |
| API Style | ✅ Modern async/await | ⚠️ Callback-based |
| Memory Management | ✅ Automatic | ⚠️ Manual |
| Performance | ✅ Direct bindings | ⚠️ CLI wrapper |

**Recommendation**: Use this package (@uploadista/flow-videos-av-node) for new projects. The fluent-ffmpeg package is deprecated and unmaintained.

## License

MIT
