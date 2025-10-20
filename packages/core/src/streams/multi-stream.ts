import { Stream } from "effect";
import { UploadistaError } from "../errors/uploadista-error";

/**
 * Options for configuring a MultiStream instance
 */
export type StreamOptions = {
  /** Whether the stream should operate in object mode */
  objectMode?: boolean;
  /** The maximum number of chunks that can be queued before backpressure is applied */
  highWaterMark?: number;
};

/**
 * A stream that combines multiple ReadableStreams into a single stream.
 * It reads from each stream in sequence, forwarding their chunks to the output.
 *
 * @example
 * ```typescript
 * const stream1 = new ReadableStream({...});
 * const stream2 = new ReadableStream({...});
 * const multiStream = new MultiStream([stream1, stream2]);
 * ```
 */
export class MultiStream {
  /** The underlying ReadableStream */
  private stream: ReadableStream;
  /** The current stream being read from */
  private current: ReadableStream | null = null;
  /** Queue of streams to be processed */
  private queue!: ReadableStream[];

  /**
   * Creates a new MultiStream instance
   * @param streams - Array of streams or stream factories to combine
   * @param options - Configuration options for the stream
   */
  constructor(streams: ReadableStream[]) {
    this.stream = new ReadableStream({
      start: (controller) => {
        this.queue = streams;
        this.next(controller);
      },
      cancel: (reason) => {
        this.destroy(reason);
      },
    });
  }

  /**
   * Gets the underlying ReadableStream
   */
  get readable(): ReadableStream {
    return this.stream;
  }

  /**
   * Moves to the next stream in the queue
   * @param controller - The stream controller to forward data to
   */
  private async next(controller: ReadableStreamDefaultController) {
    this.current = null;

    if (this.queue.length === 0) {
      controller.close();
      return;
    }

    const nextStream = this.queue.shift();
    if (!nextStream) {
      controller.close();
      return;
    }

    try {
      this.current = nextStream;

      // Process the entire stream before moving to next
      await this.processCurrentStream(controller);

      // Move to next stream
      this.next(controller);
    } catch (err) {
      controller.error(err);
    }
  }

  /**
   * Processes the current stream completely
   * @param controller - The stream controller to forward data to
   */
  private async processCurrentStream(
    controller: ReadableStreamDefaultController,
  ) {
    if (!this.current) return;

    const reader = this.current.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Destroys all streams in the queue and the current stream
   * @param reason - Optional reason for destroying the streams
   */
  private async destroy(reason?: unknown) {
    const streams: ReadableStream[] = [];
    if (this.current) streams.push(this.current);
    if (Array.isArray(this.queue)) {
      streams.push(...this.queue);
    }

    await Promise.all(
      streams.map(async (stream) => {
        try {
          if (!stream.locked) {
            await stream.cancel(reason);
          }
          // If stream is locked, it's being processed and will be cleaned up naturally
        } catch {
          // Ignore errors during cleanup
        }
      }),
    );
  }

  /**
   * Creates a new MultiStream instance in object mode
   * @param streams - Array of readable streams or stream factories to combine
   * @returns A new MultiStream instance configured for object mode
   */
  static obj(streams: ReadableStream[]) {
    return new MultiStream(streams);
  }
}

/**
 * Effect-based MultiStream that combines multiple Effect Streams into a single stream
 * @deprecated Use Effect Stream utilities directly instead
 */
export const MultiStreamEffect = {
  /**
   * Combines multiple Effect streams into a single sequential stream
   * @param streams - Array of Effect streams to combine
   * @returns A single Effect stream containing all data from input streams
   */
  fromStreams: <A, E = UploadistaError>(
    streams: Array<Stream.Stream<A, E>>,
  ): Stream.Stream<A, E> =>
    Stream.fromIterable(streams).pipe(Stream.flatMap((stream) => stream)),

  /**
   * Creates a MultiStream from ReadableStream instances using Effect
   * @param streams - Array of ReadableStreams to combine
   * @returns Effect stream of Uint8Array chunks
   */
  fromReadableStreams: (
    streams: ReadableStream<Uint8Array>[],
  ): Stream.Stream<Uint8Array, UploadistaError> =>
    Stream.fromIterable(streams).pipe(
      Stream.flatMap((readableStream) =>
        Stream.fromReadableStream(
          () => readableStream,
          (error) =>
            new UploadistaError({
              code: "UNKNOWN_ERROR",
              status: 500,
              body: "Stream processing failed",
              details: String(error),
            }),
        ),
      ),
    ),

  /**
   * Creates a MultiStream instance compatible with legacy API
   * @param streams - Array of streams to combine
   * @returns Legacy MultiStream instance
   */
  obj: (streams: ReadableStream[]) => new MultiStream(streams),
};
