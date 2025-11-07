import type { TranscodeVideoParams } from "@uploadista/core/flow";
import type { FFEncoderCodec } from "node-av/constants";
import {
  FF_ENCODER_AAC,
  FF_ENCODER_LIBAOM_AV1,
  FF_ENCODER_LIBMP3LAME,
  FF_ENCODER_LIBOPUS,
  FF_ENCODER_LIBVORBIS,
  FF_ENCODER_LIBVPX_VP9,
  FF_ENCODER_LIBX264,
  FF_ENCODER_LIBX265,
  FF_ENCODER_MJPEG,
  FF_ENCODER_PNG,
} from "node-av/constants";

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
 * Maps codec parameter to node-av codec constant
 */
export const codecToAVName: Record<
  NonNullable<TranscodeVideoParams["codec"]>,
  FFEncoderCodec
> = {
  h264: FF_ENCODER_LIBX264,
  h265: FF_ENCODER_LIBX265,
  vp9: FF_ENCODER_LIBVPX_VP9,
  av1: FF_ENCODER_LIBAOM_AV1,
};

/**
 * Maps audio codec parameter to node-av audio codec constant
 */
export const audioCodecToAVName: Record<
  NonNullable<TranscodeVideoParams["audioCodec"]>,
  FFEncoderCodec
> = {
  aac: FF_ENCODER_AAC,
  mp3: FF_ENCODER_LIBMP3LAME,
  opus: FF_ENCODER_LIBOPUS,
  vorbis: FF_ENCODER_LIBVORBIS,
};

/**
 * Maps image format to encoder constant
 */
export const imageFormatToEncoder: Record<string, FFEncoderCodec> = {
  jpeg: FF_ENCODER_MJPEG,
  mjpeg: FF_ENCODER_MJPEG,
  png: FF_ENCODER_PNG,
};
