import { UploadistaError } from "@uploadista/core/errors";
import { Effect, Stream } from "effect";
import type { IOOutputCallbacks } from "node-av/api";

/**
 * Creates a streaming output that implements IOOutputCallbacks
 * and provides the output as an Effect Stream for memory-efficient processing.
 *
 * Unlike createMemoryOutput which buffers all data in memory,
 * this utility emits chunks as they are written, allowing them
 * to be streamed directly to storage.
 *
 * @returns IOOutputCallbacks and an Effect Stream of output chunks
 */
export function createStreamingOutput(): {
  callbacks: IOOutputCallbacks;
  stream: Stream.Stream<Uint8Array, UploadistaError>;
  finalize: () => void;
} {
  // Queue to hold chunks until they're consumed
  const chunkQueue: Uint8Array[] = [];
  let isFinalized = false;
  let resolveWaiting: (() => void) | null = null;

  // Track position for seek operations
  let position = 0n;

  const callbacks: IOOutputCallbacks = {
    write: (buffer: Buffer): number => {
      // Create a copy of the buffer data to avoid issues with buffer reuse
      const chunk = new Uint8Array(buffer);
      chunkQueue.push(chunk);
      position += BigInt(buffer.length);

      // If something is waiting for data, notify it
      if (resolveWaiting) {
        const resolve = resolveWaiting;
        resolveWaiting = null;
        resolve();
      }

      return buffer.length;
    },
    seek: (offset: bigint, whence: number): bigint => {
      // Handle seeking for container formats
      // AVSEEK_SET = 0, AVSEEK_CUR = 1, AVSEEK_END = 2
      switch (whence) {
        case 0: // AVSEEK_SET
          position = offset;
          break;
        case 1: // AVSEEK_CUR
          position += offset;
          break;
        case 2: // AVSEEK_END
          // For streaming, we can't know the end position
          // Most streaming-compatible formats minimize this
          position = offset;
          break;
      }
      return position;
    },
  };

  // Create the output stream
  const stream = Stream.async<Uint8Array, UploadistaError>((emit) => {
    const processQueue = async () => {
      while (true) {
        // Emit any queued chunks
        while (chunkQueue.length > 0) {
          const chunk = chunkQueue.shift();
          if (chunk) {
            emit.single(chunk);
          }
        }

        // If finalized and queue is empty, we're done
        if (isFinalized && chunkQueue.length === 0) {
          emit.end();
          return;
        }

        // Wait for more data
        await new Promise<void>((resolve) => {
          resolveWaiting = resolve;
          // Check again in case data arrived while we were setting up
          if (chunkQueue.length > 0 || isFinalized) {
            resolveWaiting = null;
            resolve();
          }
        });
      }
    };

    // Start processing in the background
    processQueue().catch((error) => {
      emit.fail(
        UploadistaError.fromCode("VIDEO_PROCESSING_FAILED", {
          body: `Streaming output failed: ${error instanceof Error ? error.message : String(error)}`,
          cause: error,
        }),
      );
    });

    return Effect.void;
  });

  const finalize = () => {
    isFinalized = true;
    // Wake up any waiting consumers
    if (resolveWaiting) {
      const resolve = resolveWaiting;
      resolveWaiting = null;
      resolve();
    }
  };

  return { callbacks, stream, finalize };
}

/**
 * Collects a stream into a Uint8Array buffer.
 * Used when streaming input is not supported for a format.
 *
 * @param inputStream - The input stream to collect
 * @returns Effect that resolves to the collected buffer
 */
export function collectStreamToBuffer(
  inputStream: Stream.Stream<Uint8Array, UploadistaError>,
): Effect.Effect<Uint8Array, UploadistaError> {
  return Effect.gen(function* () {
    const chunks: Uint8Array[] = [];
    yield* Stream.runForEach(inputStream, (chunk) =>
      Effect.sync(() => {
        chunks.push(chunk);
      }),
    );

    const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const buffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return buffer;
  });
}

/**
 * Checks if the input is an MPEG-TS format based on the sync byte.
 * MPEG-TS packets start with the sync byte 0x47.
 *
 * @param header - First bytes of the file (at least 1 byte needed)
 * @returns true if the format appears to be MPEG-TS
 */
export function isMpegTS(header: Uint8Array): boolean {
  // MPEG-TS sync byte
  return header.length > 0 && header[0] === 0x47;
}

/**
 * Checks if a MIME type indicates MPEG-TS format.
 *
 * @param mimeType - The MIME type to check
 * @returns true if the MIME type indicates MPEG-TS
 */
export function isMpegTSMimeType(mimeType: string | undefined): boolean {
  if (!mimeType) return false;
  const normalizedType = mimeType.toLowerCase();
  return (
    normalizedType === "video/mp2t" ||
    normalizedType === "video/mpeg-ts" ||
    normalizedType === "video/mpegts" ||
    normalizedType === "application/x-mpegts"
  );
}
