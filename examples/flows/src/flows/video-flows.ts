import {
  createFlow,
  createInputNode,
} from "@uploadista/core";
import {
  createDescribeVideoNode,
  createTranscodeVideoNode,
  createTrimVideoNode,
  createVideoResizeNode,
  createVideoThumbnailNode,
} from "@uploadista/flow-videos-nodes";

/**
 * Video transcoding flow - converts videos to different formats and codecs
 *
 * Nodes: input → transcode (sink)
 *
 * Configuration:
 * - Codec: h264 (widely supported)
 * - Quality: medium (balanced size and quality)
 * - Container: mp4
 *
 * Use case: Convert uploaded videos to web-friendly formats, ensure consistent
 * codec across platforms, or reduce file size for streaming. The transcode node
 * is a sink (no outgoing edges), so the transcoded file is automatically persisted
 * to target storage.
 *
 * @example
 * ```ts
 * import { transcodeVideoFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(transcodeVideoFlow, videoFile);
 * ```
 */
export const transcodeVideoFlow = createFlow({
  flowId: "transcode-video-flow",
  name: "Transcode Video Flow",
  nodes: {
    input: createInputNode("input"),
    transcode: createTranscodeVideoNode("transcode", {
      format: "webm",
      codec: "vp9",
      videoBitrate: "1000k",
    }),
  },
  edges: [
    { source: "input", target: "transcode" },
  ],
});

/**
 * Video trimming flow - cuts videos to specified time ranges
 *
 * Nodes: input → trim (sink)
 *
 * Configuration:
 * - Start: 5 seconds
 * - End: 30 seconds
 *
 * Use case: Extract clips from longer videos, remove intro/outro sections,
 * or create preview clips from full videos. The trim node is a sink (no outgoing
 * edges), so the trimmed file is automatically persisted to target storage.
 *
 * @example
 * ```ts
 * import { trimVideoFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(trimVideoFlow, longVideo);
 * // result.file = 25-second clip (from 5s to 30s)
 * ```
 */
export const trimVideoFlow = createFlow({
  flowId: "trim-video-flow",
  name: "Trim Video Flow",
  nodes: {
    input: createInputNode("input"),
    trim: createTrimVideoNode("trim", {
      startTime: 5,
      endTime: 30,
    }),
  },
  edges: [
    { source: "input", target: "trim" },
  ],
});

/**
 * Video thumbnail flow - extracts a frame from video as an image
 *
 * Nodes: input → thumbnail (sink)
 *
 * Configuration:
 * - Timestamp: 10 seconds
 * - Format: jpeg
 * - Quality: 85
 *
 * Use case: Generate preview images for video listings, create thumbnail
 * galleries, or extract key frames for analysis. The thumbnail node is a sink
 * (no outgoing edges), so the thumbnail is automatically persisted to target storage.
 *
 * @example
 * ```ts
 * import { thumbnailFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(thumbnailFlow, videoFile);
 * // result.file = JPEG image of frame at 10 seconds
 * ```
 */
export const thumbnailFlow = createFlow({
  flowId: "thumbnail-flow",
  name: "Thumbnail Flow",
  nodes: {
    input: createInputNode("input"),
    thumbnail: createVideoThumbnailNode("thumbnail", {
      timestamp: 10,
      format: "jpeg",
      quality: 85,
    }),
  },
  edges: [
    { source: "input", target: "thumbnail" },
  ],
});

/**
 * Video resize flow - changes video dimensions while maintaining aspect ratio
 *
 * Nodes: input → resize (sink)
 *
 * Configuration:
 * - Width: 1280px
 * - Height: 720px (720p)
 * - Fit: cover
 *
 * Use case: Standardize video dimensions for consistent display, reduce
 * file size, or create mobile-optimized versions. The resize node is a sink
 * (no outgoing edges), so the resized video is automatically persisted to
 * target storage.
 *
 * @example
 * ```ts
 * import { resizeVideoFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(resizeVideoFlow, hdVideo);
 * // result.file = 720p video
 * ```
 */
export const resizeVideoFlow = createFlow({
  flowId: "resize-video-flow",
  name: "Resize Video Flow",
  nodes: {
    input: createInputNode("input"),
    resize: createVideoResizeNode("resize-video", {
      width: 1280,
      height: 720,
      aspectRatio: "keep",
      scaling: "bicubic",
    }),
  },
  edges: [
    { source: "input", target: "resize" },
  ],
});

/**
 * Video description flow - generates AI-powered descriptions of video content
 *
 * Nodes: input → describe-video (sink)
 *
 * Configuration:
 * - Uses AI vision models to analyze video frames and motion
 * - Generates descriptions of actions, scenes, and objects
 *
 * Use case: Automatically generate video captions, create searchable metadata,
 * provide content moderation insights, or improve accessibility. The describe-video
 * node is a sink (no outgoing edges), so the described video is automatically
 * persisted to target storage.
 *
 * Note: Requires AI service credentials (e.g., OpenAI, Replicate) to be configured.
 *
 * @example
 * ```ts
 * import { describeVideoFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(describeVideoFlow, videoFile);
 * // result.metadata.description = "Person walking through a park in autumn"
 * ```
 */
export const describeVideoFlow = createFlow({
  flowId: "describe-video-flow",
  name: "Describe Video Flow",
  nodes: {
    input: createInputNode("input"),
    "describe-video": createDescribeVideoNode("describe-video"),
  },
  edges: [
    { source: "input", target: "describe-video" },
  ],
});
