import type { BufferedChunk } from "./types/buffered-chunk";

export interface ChunkBufferConfig {
  minThreshold: number;
  maxBufferSize?: number;
  timeoutMs?: number;
}

/**
 * ChunkBuffer accumulates small chunks until they meet the minimum threshold
 * required by the datastore (e.g., S3's 5MB minimum part size).
 * This prevents inefficient upload/download cycles of incomplete parts.
 */
export class ChunkBuffer {
  private buffer: Uint8Array[] = [];
  private currentSize = 0;
  private config: Required<ChunkBufferConfig>;
  private lastAddTime = 0;

  constructor(config: ChunkBufferConfig) {
    this.config = {
      minThreshold: config.minThreshold,
      maxBufferSize: config.maxBufferSize ?? config.minThreshold * 2,
      timeoutMs: config.timeoutMs ?? 30000, // 30 seconds
    };
  }

  /**
   * Add a chunk to the buffer. Returns the accumulated chunk if threshold is met.
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
   * Force flush the buffer, returning whatever is accumulated.
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
   * Check if buffer should be flushed based on size, max buffer, or timeout.
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
   * Get the current buffer state without flushing.
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
   * Check if the buffer has any pending data.
   */
  hasPendingData(): boolean {
    return this.buffer.length > 0;
  }

  /**
   * Clear the buffer without returning data.
   */
  reset(): void {
    this.buffer = [];
    this.currentSize = 0;
    this.lastAddTime = 0;
  }

  /**
   * Get the minimum threshold this buffer is configured for.
   */
  getMinThreshold(): number {
    return this.config.minThreshold;
  }
}
