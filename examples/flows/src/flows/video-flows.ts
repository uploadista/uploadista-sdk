import {
  createFlow,
  createInputNode,
  createStorageNode,
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
 * Nodes: input → transcode → output
 *
 * Configuration:
 * - Codec: h264 (widely supported)
 * - Quality: medium (balanced size and quality)
 * - Container: mp4
 *
 * Use case: Convert uploaded videos to web-friendly formats, ensure consistent
 * codec across platforms, or reduce file size for streaming.
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
    output: createStorageNode("output"),
  },
  edges: [
    { source: "input", target: "transcode" },
    { source: "transcode", target: "output" },
  ],
});

/**
 * Video trimming flow - cuts videos to specified time ranges
 *
 * Nodes: input → trim → output
 *
 * Configuration:
 * - Start: 5 seconds
 * - End: 30 seconds
 *
 * Use case: Extract clips from longer videos, remove intro/outro sections,
 * or create preview clips from full videos.
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
    output: createStorageNode("output"),
  },
  edges: [
    { source: "input", target: "trim" },
    { source: "trim", target: "output" },
  ],
});

/**
 * Video thumbnail flow - extracts a frame from video as an image
 *
 * Nodes: input → thumbnail → output
 *
 * Configuration:
 * - Timestamp: 10 seconds
 * - Format: jpeg
 * - Quality: 85
 *
 * Use case: Generate preview images for video listings, create thumbnail
 * galleries, or extract key frames for analysis.
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
    output: createStorageNode("output"),
  },
  edges: [
    { source: "input", target: "thumbnail" },
    { source: "thumbnail", target: "output" },
  ],
});

/**
 * Video resize flow - changes video dimensions while maintaining aspect ratio
 *
 * Nodes: input → resize → output
 *
 * Configuration:
 * - Width: 1280px
 * - Height: 720px (720p)
 * - Fit: cover
 *
 * Use case: Standardize video dimensions for consistent display, reduce
 * file size, or create mobile-optimized versions.
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
    output: createStorageNode("output"),
  },
  edges: [
    { source: "input", target: "resize" },
    { source: "resize", target: "output" },
  ],
});

/**
 * Video description flow - generates AI-powered descriptions of video content
 *
 * Nodes: input → describe-video → output
 *
 * Configuration:
 * - Uses AI vision models to analyze video frames and motion
 * - Generates descriptions of actions, scenes, and objects
 *
 * Use case: Automatically generate video captions, create searchable metadata,
 * provide content moderation insights, or improve accessibility.
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
    output: createStorageNode("output"),
  },
  edges: [
    { source: "input", target: "describe-video" },
    { source: "describe-video", target: "output" },
  ],
});
