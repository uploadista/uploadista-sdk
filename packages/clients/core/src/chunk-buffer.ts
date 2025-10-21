import type { BufferedChunk } from "./types/buffered-chunk";

/**
 * Configuration options for ChunkBuffer.
 *
 * Controls how the buffer accumulates chunks before flushing them to the datastore.
 * This is essential for datastores with minimum chunk size requirements (e.g., AWS S3's 5MB minimum).
 */
export interface ChunkBufferConfig {
  /**
   * Minimum chunk size required by the datastore before flushing (in bytes).
   * For example, AWS S3 requires a minimum of 5MB per multipart upload part.
   */
  minThreshold: number;

  /**
   * Maximum buffer size before forcing a flush (in bytes).
   * Defaults to 2x minThreshold. Prevents memory issues with very slow uploads.
   */
  maxBufferSize?: number;

  /**
   * Maximum time to wait before flushing pending data (in milliseconds).
   * Defaults to 30000ms (30 seconds). Ensures timely uploads even with slow data arrival.
   */
  timeoutMs?: number;
}

/**
 * ChunkBuffer accumulates small chunks until they meet the minimum threshold
 * required by the datastore (e.g., S3's 5MB minimum part size).
 *
 * This prevents inefficient upload/download cycles of incomplete parts by buffering
 * small chunks in memory until they reach the datastore's minimum size requirement.
 * The buffer automatically flushes when the threshold is met, the maximum buffer
 * size is exceeded, or a timeout occurs.
 *
 * @example Basic usage with S3's 5MB minimum
 * ```typescript
 * const buffer = new ChunkBuffer({
 *   minThreshold: 5 * 1024 * 1024, // 5MB
 *   maxBufferSize: 10 * 1024 * 1024, // 10MB
 *   timeoutMs: 30000, // 30 seconds
 * });
 *
 * // Add chunks as they arrive
 * const chunk1 = new Uint8Array(2 * 1024 * 1024); // 2MB
 * buffer.add(chunk1); // Returns null (below threshold)
 *
 * const chunk2 = new Uint8Array(3 * 1024 * 1024); // 3MB
 * const buffered = buffer.add(chunk2); // Returns combined 5MB chunk
 * ```
 *
 * @example Handling incomplete uploads
 * ```typescript
 * const buffer = new ChunkBuffer({ minThreshold: 5 * 1024 * 1024 });
 *
 * // After adding several small chunks
 * buffer.add(smallChunk1);
 * buffer.add(smallChunk2);
 *
 * // Force flush remaining data at end of upload
 * if (buffer.hasPendingData()) {
 *   const finalChunk = buffer.flush();
 *   await uploadFinalChunk(finalChunk);
 * }
 * ```
 */
export class ChunkBuffer {
  private buffer: Uint8Array[] = [];
  private currentSize = 0;
  private config: Required<ChunkBufferConfig>;
  private lastAddTime = 0;

  /**
   * Creates a new ChunkBuffer instance.
   *
   * @param config - Buffer configuration including thresholds and timeout
   */
  constructor(config: ChunkBufferConfig) {
    this.config = {
      minThreshold: config.minThreshold,
      maxBufferSize: config.maxBufferSize ?? config.minThreshold * 2,
      timeoutMs: config.timeoutMs ?? 30000, // 30 seconds
    };
  }

  /**
   * Adds a chunk to the buffer and returns the accumulated chunk if the flush threshold is met.
   *
   * The buffer will automatically flush (return the combined chunk) when:
   * - The total buffered size meets or exceeds minThreshold
   * - The total buffered size exceeds maxBufferSize
   * - The time since the last chunk exceeds timeoutMs
   *
   * @param chunk - The chunk data to add to the buffer
   * @returns The combined buffered chunk if flush conditions are met, null otherwise
   *
   * @example Progressive buffering
   * ```typescript
   * const buffer = new ChunkBuffer({ minThreshold: 1024 * 1024 }); // 1MB
   *
   * // First chunk doesn't meet threshold
   * const result1 = buffer.add(new Uint8Array(512 * 1024)); // 512KB
   * console.log(result1); // null
   *
   * // Second chunk triggers flush
   * const result2 = buffer.add(new Uint8Array(512 * 1024)); // 512KB
   * console.log(result2?.size); // 1048576 (1MB total)
   * ```
   */
  add(chunk: Uint8Array): BufferedChunk | null {
    this.buffer.push(chunk);
    this.currentSize += chunk.length;
    this.lastAddTime = Date.now();

    if (this.shouldFlush()) {
      return this.flush();
    }

    return null;
  }

  /**
   * Forces the buffer to flush immediately, returning all accumulated data.
   *
   * This is typically called at the end of an upload to ensure any remaining
   * buffered data is sent, even if it hasn't reached the minimum threshold.
   *
   * @returns The combined buffered chunk, or null if the buffer is empty
   *
   * @example Flushing at upload completion
   * ```typescript
   * const buffer = new ChunkBuffer({ minThreshold: 5 * 1024 * 1024 });
   *
   * // Upload file in chunks
   * for (const chunk of fileChunks) {
   *   const buffered = buffer.add(chunk);
   *   if (buffered) await uploadChunk(buffered);
   * }
   *
   * // Upload any remaining data
   * const final = buffer.flush();
   * if (final) await uploadChunk(final);
   * ```
   */
  flush(): BufferedChunk | null {
    if (this.buffer.length === 0) {
      return null;
    }

    const combined = new Uint8Array(this.currentSize);
    let offset = 0;

    for (const chunk of this.buffer) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const result: BufferedChunk = {
      data: combined,
      size: this.currentSize,
      timestamp: this.lastAddTime,
    };

    this.reset();
    return result;
  }

  /**
   * Checks if the buffer should be flushed based on size, max buffer, or timeout conditions.
   *
   * Returns true if any of these conditions are met:
   * - Current size >= minThreshold
   * - Current size >= maxBufferSize
   * - Time since last add > timeoutMs
   *
   * @returns True if the buffer should be flushed
   *
   * @example Manual flush control
   * ```typescript
   * const buffer = new ChunkBuffer({ minThreshold: 1024 * 1024 });
   *
   * buffer.add(smallChunk);
   *
   * if (buffer.shouldFlush()) {
   *   const data = buffer.flush();
   *   await upload(data);
   * }
   * ```
   */
  shouldFlush(): boolean {
    if (this.currentSize >= this.config.minThreshold) {
      return true;
    }

    if (this.currentSize >= this.config.maxBufferSize) {
      return true;
    }

    const timeSinceLastAdd = Date.now() - this.lastAddTime;
    if (this.buffer.length > 0 && timeSinceLastAdd > this.config.timeoutMs) {
      return true;
    }

    return false;
  }

  /**
   * Returns the current buffer state without flushing.
   *
   * Useful for monitoring buffer status and making informed decisions
   * about when to manually flush or adjust upload strategies.
   *
   * @returns Object containing buffer metrics
   *
   * @example Monitoring buffer state
   * ```typescript
   * const buffer = new ChunkBuffer({ minThreshold: 1024 * 1024 });
   * buffer.add(chunk);
   *
   * const info = buffer.getBufferInfo();
   * console.log(`Buffered: ${info.size} bytes in ${info.chunkCount} chunks`);
   * console.log(`Ready to flush: ${info.isReadyToFlush}`);
   * console.log(`Time since last add: ${info.timeSinceLastAdd}ms`);
   * ```
   */
  getBufferInfo(): {
    size: number;
    chunkCount: number;
    isReadyToFlush: boolean;
    timeSinceLastAdd: number;
  } {
    return {
      size: this.currentSize,
      chunkCount: this.buffer.length,
      isReadyToFlush: this.shouldFlush(),
      timeSinceLastAdd: Date.now() - this.lastAddTime,
    };
  }

  /**
   * Checks if the buffer has any pending data that hasn't been flushed.
   *
   * Useful for determining if a final flush is needed at upload completion.
   *
   * @returns True if there are chunks waiting in the buffer
   *
   * @example Ensuring complete upload
   * ```typescript
   * // Upload all chunks
   * for (const chunk of chunks) {
   *   const buffered = buffer.add(chunk);
   *   if (buffered) await upload(buffered);
   * }
   *
   * // Don't forget the last partial chunk!
   * if (buffer.hasPendingData()) {
   *   await upload(buffer.flush());
   * }
   * ```
   */
  hasPendingData(): boolean {
    return this.buffer.length > 0;
  }

  /**
   * Clears the buffer without returning data.
   *
   * This discards all buffered chunks and resets the buffer state.
   * Use with caution as this will lose any pending data.
   */
  reset(): void {
    this.buffer = [];
    this.currentSize = 0;
    this.lastAddTime = 0;
  }

  /**
   * Returns the minimum threshold this buffer is configured for.
   *
   * @returns Minimum chunk size in bytes before flushing
   */
  getMinThreshold(): number {
    return this.config.minThreshold;
  }
}
