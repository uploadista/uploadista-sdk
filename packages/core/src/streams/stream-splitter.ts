import { Effect, Ref, Stream } from "effect";
import { UploadistaError } from "../errors/uploadista-error";

type Options = {
  chunkSize: number;
};

export type ChunkInfo = {
  partNumber: number;
  stream: Uint8Array;
  size: number;
};

type EventHandlers = {
  onData?: (chunkSize: number) => void;
  onChunkStarted: (partNumber: number) => void;
  onChunkCompleted: (chunkInfo: ChunkInfo) => void;
  onChunkError: (partNumber: number, error: unknown) => void;
};

function concatArrayBuffers(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function streamSplitter(
  readStream: ReadableStream<Uint8Array>,
  {
    onData,
    onChunkError,
    onChunkStarted,
    onChunkCompleted,
    options: { chunkSize },
  }: EventHandlers & { options: Options },
): Promise<void> {
  const reader = readStream.getReader();

  let part = 1;
  let currentPartChunks: Uint8Array[] = [];
  let currentPartSize = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      onData?.(value?.byteLength ?? 0);

      if (done) {
        // Process any remaining data
        if (currentPartSize > 0) {
          onChunkStarted(part);

          const stream = concatArrayBuffers(currentPartChunks);

          onChunkCompleted({
            partNumber: part,
            stream,
            size: stream.length,
          });
        }
        break;
      }

      let remaining = value;

      while (remaining.length > 0) {
        const spaceInCurrentPart = chunkSize - currentPartSize;

        if (remaining.length <= spaceInCurrentPart) {
          // All remaining data fits in current part
          currentPartChunks.push(remaining);
          currentPartSize += remaining.length;
          break;
        } else {
          // Need to split the data
          const partToTake = remaining.slice(0, spaceInCurrentPart);
          currentPartChunks.push(partToTake);
          currentPartSize += partToTake.length;

          // Complete current part
          onChunkStarted(part);
          const stream = concatArrayBuffers(currentPartChunks);
          onChunkCompleted({
            partNumber: part,
            stream,
            size: stream.length,
          });

          // Start new part
          part += 1;
          currentPartChunks = [];
          currentPartSize = 0;
          remaining = remaining.slice(spaceInCurrentPart);
        }
      }
    }
  } catch (error) {
    onChunkError(part, error);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Effect-based stream splitter that splits a stream into chunks of specified size
 */
export const StreamSplitterEffect = {
  /**
   * Splits an Effect stream into chunks of specified size using idiomatic Effect-TS patterns
   * @param chunkSize - Maximum size for each chunk in bytes
   * @param onChunkStarted - Callback when a new chunk starts processing
   * @param onChunkCompleted - Callback when a chunk is completed
   * @param onChunkError - Callback when a chunk encounters an error
   * @param onData - Optional callback for data progress
   * @returns Effect that splits the input stream
   */
  split:
    ({
      chunkSize,
      onChunkStarted,
      onChunkCompleted,
      onChunkError,
      onData,
    }: {
      chunkSize: number;
      onChunkStarted: (partNumber: number) => void;
      onChunkCompleted: (chunkInfo: ChunkInfo) => void;
      onChunkError: (partNumber: number, error: unknown) => void;
      onData?: (chunkSize: number) => void;
    }) =>
    <E>(
      stream: Stream.Stream<Uint8Array, E>,
    ): Stream.Stream<ChunkInfo, E | UploadistaError> => {
      return Effect.gen(function* () {
        const stateRef = yield* Ref.make({
          partNumber: 1,
          buffer: [] as Uint8Array[],
          bufferSize: 0,
        });

        const processChunkAndEmitCompleted = (
          chunk: Uint8Array,
        ): Effect.Effect<ChunkInfo[], UploadistaError> =>
          Effect.gen(function* () {
            // Report data progress
            if (onData) {
              yield* Effect.sync(() => onData(chunk.byteLength));
            }

            let remaining = chunk;
            const results: ChunkInfo[] = [];

            while (remaining.length > 0) {
              const state = yield* Ref.get(stateRef);
              const spaceAvailable = chunkSize - state.bufferSize;

              if (remaining.length <= spaceAvailable) {
                // All remaining data fits in current part
                yield* Ref.update(stateRef, (s) => ({
                  ...s,
                  buffer: [...s.buffer, remaining],
                  bufferSize: s.bufferSize + remaining.length,
                }));
                break;
              } else {
                // Need to split the data - complete current part
                const partToTake = remaining.slice(0, spaceAvailable);
                const completeBuffer = [...state.buffer, partToTake];

                // Execute side effects in Effect context
                yield* Effect.sync(() => onChunkStarted(state.partNumber));

                const concatenatedStream = concatArrayBuffers(completeBuffer);
                const chunkInfo: ChunkInfo = {
                  partNumber: state.partNumber,
                  stream: concatenatedStream,
                  size: concatenatedStream.length,
                };

                yield* Effect.sync(() => onChunkCompleted(chunkInfo));
                results.push(chunkInfo);

                // Start new part
                yield* Ref.set(stateRef, {
                  partNumber: state.partNumber + 1,
                  buffer: [],
                  bufferSize: 0,
                });
                remaining = remaining.slice(spaceAvailable);
              }
            }

            return results;
          });

        const emitFinalChunk = (): Effect.Effect<
          ChunkInfo[],
          UploadistaError
        > =>
          Effect.gen(function* () {
            const finalState = yield* Ref.get(stateRef);
            if (finalState.bufferSize === 0) {
              return [];
            }

            yield* Effect.sync(() => onChunkStarted(finalState.partNumber));

            const concatenatedStream = concatArrayBuffers(finalState.buffer);
            const chunkInfo: ChunkInfo = {
              partNumber: finalState.partNumber,
              stream: concatenatedStream,
              size: concatenatedStream.length,
            };

            yield* Effect.sync(() => onChunkCompleted(chunkInfo));
            return [chunkInfo];
          });

        return stream.pipe(
          Stream.mapEffect(processChunkAndEmitCompleted),
          Stream.flatMap((chunkInfos) => Stream.fromIterable(chunkInfos)),
          Stream.concat(
            Stream.fromEffect(emitFinalChunk()).pipe(
              Stream.flatMap((chunkInfos) => Stream.fromIterable(chunkInfos)),
            ),
          ),
          Stream.tapError((error) => Effect.sync(() => onChunkError(1, error))),
          Stream.mapError(
            (error) =>
              new UploadistaError({
                code: "UNKNOWN_ERROR",
                status: 500,
                body: "Stream splitting failed",
                details: `Stream splitting failed: ${String(error)}`,
              }),
          ),
        );
      }).pipe(Stream.unwrap);
    },

  /**
   * Creates a legacy stream splitter effect from ReadableStream
   * @param readStream - Input ReadableStream
   * @param handlers - Event handlers for chunk processing
   * @returns Effect that processes the stream
   */
  fromReadableStream: (
    readStream: ReadableStream<Uint8Array>,
    handlers: EventHandlers & { options: Options },
  ): Effect.Effect<void, UploadistaError> =>
    Effect.tryPromise({
      try: () => streamSplitter(readStream, handlers),
      catch: (error) =>
        new UploadistaError({
          code: "UNKNOWN_ERROR",
          status: 500,
          body: "Stream splitter failed",
          details: `Stream splitter failed: ${String(error)}`,
        }),
    }),
};
