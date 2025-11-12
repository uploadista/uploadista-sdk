// Video processing nodes

// Import from core packages to ensure proper type resolution in generated declarations
// These imports force tsdown to create namespace aliases instead of inlining types
import type {} from "@uploadista/core/types";
import type {} from "@uploadista/core/upload";

// Re-export types from core for convenience
export type {
  DescribeVideoMetadata,
  ExtractFrameVideoParams,
  ResizeVideoParams,
  TranscodeVideoParams,
  TrimVideoParams,
} from "@uploadista/core/flow";
export { createDescribeVideoNode } from "./describe-video-node";
export { createVideoResizeNode } from "./resize-node";
export { createVideoThumbnailNode } from "./thumbnail-node";
export { createTranscodeVideoNode } from "./transcode-node";
export { createTrimVideoNode } from "./trim-node";
