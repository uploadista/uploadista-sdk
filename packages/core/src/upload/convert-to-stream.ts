import { Stream } from "effect";
import { UploadistaError } from "../errors";

/**
 * Converts a ReadableStream to an Effect Stream.
 *
 * This utility function wraps a ReadableStream in an Effect Stream, providing
 * proper error handling and integration with the Effect ecosystem. It's used
 * throughout the upload system to convert raw streams into Effect-compatible
 * streams for processing.
 *
 * The function handles:
 * - Stream conversion with proper error mapping
 * - UploadistaError creation for stream errors
 * - Integration with Effect Stream processing
 *
 * @param data - The ReadableStream to convert
 * @returns Effect Stream that can be processed with Effect operations
 *
 * @example
 * ```typescript
 * // Convert a file stream to Effect Stream
 * const fileStream = new ReadableStream(...);
 * const effectStream = convertToStream(fileStream);
 *
 * // Process with Effect operations
 * const processedStream = effectStream.pipe(
 *   Stream.map((chunk) => processChunk(chunk)),
 *   Stream.filter((chunk) => chunk.length > 0)
 * );
 *
 * // Run the stream
 * await Stream.runForEach(processedStream, (chunk) =>
 *   Effect.logInfo(`Processed chunk: ${chunk.length} bytes`)
 * );
 * ```
 */
export function convertToStream<T>(data: ReadableStream<T>) {
  return Stream.fromReadableStream(
    () => data,
    (error) =>
      new UploadistaError({
        code: "UNKNOWN_ERROR",
        status: 500,
        body: String(error),
      }),
  );
}
