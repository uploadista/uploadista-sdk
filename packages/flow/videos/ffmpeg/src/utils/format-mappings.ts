import type { TranscodeVideoParams } from "@uploadista/core/flow";

/**
 * Maps video format to MIME type
 */
export const formatToMimeType: Record<TranscodeVideoParams["format"], string> =
  {
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
  };

/**
 * Maps video format to file extension
 */
export const formatToExtension: Record<TranscodeVideoParams["format"], string> =
  {
    mp4: "mp4",
    webm: "webm",
    mov: "mov",
    avi: "avi",
  };

/**
 * Maps codec parameter to FFmpeg codec name
 */
export const codecToFFmpegName: Record<
  NonNullable<TranscodeVideoParams["codec"]>,
  string
> = {
  h264: "libx264",
  h265: "libx265",
  vp9: "libvpx-vp9",
  av1: "libaom-av1",
};

/**
 * Maps audio codec parameter to FFmpeg audio codec name
 */
export const audioCodecToFFmpegName: Record<
  NonNullable<TranscodeVideoParams["audioCodec"]>,
  string
> = {
  aac: "aac",
  mp3: "libmp3lame",
  opus: "libopus",
  vorbis: "libvorbis",
};
