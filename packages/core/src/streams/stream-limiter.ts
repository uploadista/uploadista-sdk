import { Effect, Ref, Stream } from "effect";
import { UploadistaError } from "../errors/uploadista-error";

type StreamLimiterOptions = {
  maxSize: number;
  onData?: (chunkSize: number) => void;
};

export function streamLimiter({
  maxSize,
  onData,
}: StreamLimiterOptions): TransformStream {
  let currentSize = 0;

  return new TransformStream({
    transform(chunk, controller) {
      currentSize += chunk.length;

      onData?.(chunk.byteLength);

      if (currentSize > maxSize) {
        controller.error(UploadistaError.fromCode("ERR_MAX_SIZE_EXCEEDED"));
      } else {
        controller.enqueue(chunk);
      }
    },
  });
}

/**
 * Effect-based stream limiter that restricts stream size
 */
export const StreamLimiterEffect = {
  /**
   * Creates an Effect-based stream limiter
   * @param maxSize - Maximum allowed stream size in bytes
   * @param onData - Optional callback for data progress tracking
   * @returns Effect stream transformation that enforces size limits
   */
  limit:
    ({ maxSize, onData }: StreamLimiterOptions) =>
    <A>(stream: Stream.Stream<A, UploadistaError>) => {
      return Effect.gen(function* () {
        const currentSize = yield* Ref.make(0);

        return stream.pipe(
          Stream.mapEffect((chunk) =>
            Effect.gen(function* () {
              const chunkSize =
                chunk instanceof Uint8Array ? chunk.byteLength : 0;
              yield* Ref.update(currentSize, (size) => size + chunkSize);

              onData?.(chunkSize);
              const size = yield* Ref.get(currentSize);
              if (size > maxSize) {
                yield* UploadistaError.fromCode(
                  "ERR_MAX_SIZE_EXCEEDED",
                ).toEffect();
              }

              return chunk;
            }),
          ),
        );
      }).pipe(Stream.unwrap);
    },

  /**
   * Creates a legacy TransformStream-based limiter
   * @param options - Stream limiter options
   * @returns TransformStream that enforces size limits
   */
  createTransformStream: (options: StreamLimiterOptions): TransformStream =>
    streamLimiter(options),
};
