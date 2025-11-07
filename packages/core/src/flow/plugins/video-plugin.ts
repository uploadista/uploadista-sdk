import type { UploadistaError } from "@uploadista/core/errors";
import { Context, type Effect, type Layer } from "effect";

/**
 * Transcode parameters for video format and codec conversion.
 */
export type TranscodeParams = {
	/** Output container format */
	format: "mp4" | "webm" | "mov" | "avi";
	/** Video codec (optional, defaults to format's default) */
	codec?: "h264" | "h265" | "vp9" | "av1";
	/** Video bitrate (e.g., "1000k", "2M") */
	videoBitrate?: string;
	/** Audio bitrate (e.g., "128k", "192k") */
	audioBitrate?: string;
	/** Audio codec (optional, defaults to format's default) */
	audioCodec?: "aac" | "mp3" | "opus" | "vorbis";
};

/**
 * Resize parameters for video resolution changes.
 */
export type VideoResizeParams = {
	/** Target width in pixels */
	width?: number;
	/** Target height in pixels */
	height?: number;
	/** Aspect ratio handling mode */
	aspectRatio?: "keep" | "ignore";
	/** Scaling algorithm quality */
	scaling?: "bicubic" | "bilinear" | "lanczos";
};

/**
 * Trim parameters for extracting video segments.
 */
export type TrimParams = {
	/** Start time in seconds */
	startTime: number;
	/** End time in seconds (optional, if omitted goes to end) */
	endTime?: number;
	/** Duration in seconds (alternative to endTime) */
	duration?: number;
};

/**
 * Parameters for extracting a single frame from video.
 */
export type ExtractFrameParams = {
	/** Timestamp in seconds where to extract the frame */
	timestamp: number;
	/** Output image format */
	format?: "png" | "jpeg";
	/** JPEG quality 1-100 (only for jpeg format) */
	quality?: number;
};

/**
 * Video metadata extracted by the describe operation.
 */
export type VideoMetadata = {
	/** Video duration in seconds */
	duration: number;
	/** Video width in pixels */
	width: number;
	/** Video height in pixels */
	height: number;
	/** Video codec name */
	codec: string;
	/** Container format name */
	format: string;
	/** Video bitrate in bits per second */
	bitrate: number;
	/** Frame rate (fps) */
	frameRate: number;
	/** Aspect ratio as string (e.g., "16:9") */
	aspectRatio: string;
	/** Whether video has an audio track */
	hasAudio: boolean;
	/** Audio codec name (if hasAudio is true) */
	audioCodec?: string;
	/** Audio bitrate in bits per second (if hasAudio is true) */
	audioBitrate?: number;
	/** File size in bytes */
	size: number;
};

/**
 * Shape definition for the Video Plugin interface.
 * Defines the contract that all video processing implementations must follow.
 */
export type VideoPluginShape = {
	/**
	 * Transcodes a video to a different format/codec.
	 *
	 * @param input - The input video as a Uint8Array
	 * @param options - Transcode parameters including format, codec, and bitrates
	 * @returns An Effect that resolves to the transcoded video as a Uint8Array
	 * @throws {UploadistaError} When video transcoding fails
	 */
	transcode: (
		input: Uint8Array,
		options: TranscodeParams,
	) => Effect.Effect<Uint8Array, UploadistaError>;

	/**
	 * Resizes a video to specified dimensions.
	 *
	 * @param input - The input video as a Uint8Array
	 * @param options - Resize parameters including width, height, and aspect ratio handling
	 * @returns An Effect that resolves to the resized video as a Uint8Array
	 * @throws {UploadistaError} When video resizing fails
	 */
	resize: (
		input: Uint8Array,
		options: VideoResizeParams,
	) => Effect.Effect<Uint8Array, UploadistaError>;

	/**
	 * Trims a video to extract a segment by time range.
	 *
	 * @param input - The input video as a Uint8Array
	 * @param options - Trim parameters including start time and end time/duration
	 * @returns An Effect that resolves to the trimmed video as a Uint8Array
	 * @throws {UploadistaError} When video trimming fails
	 */
	trim: (
		input: Uint8Array,
		options: TrimParams,
	) => Effect.Effect<Uint8Array, UploadistaError>;

	/**
	 * Extracts a single frame from the video at a specific timestamp.
	 *
	 * @param input - The input video as a Uint8Array
	 * @param options - Frame extraction parameters including timestamp and format
	 * @returns An Effect that resolves to the extracted frame as a Uint8Array (image)
	 * @throws {UploadistaError} When frame extraction fails
	 */
	extractFrame: (
		input: Uint8Array,
		options: ExtractFrameParams,
	) => Effect.Effect<Uint8Array, UploadistaError>;

	/**
	 * Extracts metadata from a video file.
	 *
	 * @param input - The input video as a Uint8Array
	 * @returns An Effect that resolves to VideoMetadata with comprehensive video information
	 * @throws {UploadistaError} When metadata extraction fails
	 */
	describe: (
		input: Uint8Array,
	) => Effect.Effect<VideoMetadata, UploadistaError>;
};

/**
 * Context tag for the Video Plugin.
 *
 * This tag provides a type-safe way to access video processing functionality
 * throughout the application using Effect's dependency injection system.
 *
 * @example
 * ```typescript
 * import { VideoPlugin } from "@uploadista/core/flow/plugins";
 *
 * // In your flow node
 * const program = Effect.gen(function* () {
 *   const videoPlugin = yield* VideoPlugin;
 *   const transcoded = yield* videoPlugin.transcode(videoData, { format: "webm", codec: "vp9" });
 *   const resized = yield* videoPlugin.resize(transcoded, { width: 1280, height: 720, aspectRatio: "keep" });
 *   return resized;
 * });
 * ```
 */
export class VideoPlugin extends Context.Tag("VideoPlugin")<
	VideoPlugin,
	VideoPluginShape
>() {}

export type VideoPluginLayer = Layer.Layer<VideoPlugin, never, never>;
