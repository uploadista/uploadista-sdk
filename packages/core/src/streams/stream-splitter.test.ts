import { describe, expect, it, vi } from "vitest";
import { type ChunkInfo, streamSplitter } from "./stream-splitter";

function createReadableStream(data: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < data.length) {
        controller.enqueue(data[index++]);
      } else {
        controller.close();
      }
    },
  });
}

describe("streamSplitter", () => {
  it("should split stream into chunks of specified size", async () => {
    const data = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));
    const stream = createReadableStream([data]);

    const chunks: ChunkInfo[] = [];
    const onChunkStarted = vi.fn();
    const onChunkCompleted = vi.fn((chunk: ChunkInfo) => {
      chunks.push(chunk);
    });
    const onChunkError = vi.fn();

    await streamSplitter(stream, {
      onChunkStarted,
      onChunkCompleted,
      onChunkError,
      options: { chunkSize: 30 },
    });

    expect(chunks).toHaveLength(4);
    expect(chunks[0].size).toBe(30);
    expect(chunks[1].size).toBe(30);
    expect(chunks[2].size).toBe(30);
    expect(chunks[3].size).toBe(10); // Remaining data

    expect(onChunkStarted).toHaveBeenCalledTimes(4);
    expect(onChunkCompleted).toHaveBeenCalledTimes(4);
    expect(onChunkError).not.toHaveBeenCalled();
  });

  it("should handle empty stream", async () => {
    const stream = createReadableStream([]);

    const chunks: ChunkInfo[] = [];
    const onChunkStarted = vi.fn();
    const onChunkCompleted = vi.fn((chunk: ChunkInfo) => {
      chunks.push(chunk);
    });
    const onChunkError = vi.fn();

    await streamSplitter(stream, {
      onChunkStarted,
      onChunkCompleted,
      onChunkError,
      options: { chunkSize: 10 },
    });

    expect(chunks).toHaveLength(0);
    expect(onChunkStarted).not.toHaveBeenCalled();
    expect(onChunkCompleted).not.toHaveBeenCalled();
    expect(onChunkError).not.toHaveBeenCalled();
  });

  it("should handle single small chunk", async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const stream = createReadableStream([data]);

    const chunks: ChunkInfo[] = [];
    const onChunkStarted = vi.fn();
    const onChunkCompleted = vi.fn((chunk: ChunkInfo) => {
      chunks.push(chunk);
    });
    const onChunkError = vi.fn();

    await streamSplitter(stream, {
      onChunkStarted,
      onChunkCompleted,
      onChunkError,
      options: { chunkSize: 10 },
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].size).toBe(5);
    expect(chunks[0].stream).toEqual(data);
    expect(chunks[0].partNumber).toBe(1);
  });

  it("should assign correct part numbers", async () => {
    const data = new Uint8Array(50).fill(1);
    const stream = createReadableStream([data]);

    const chunks: ChunkInfo[] = [];
    const onChunkStarted = vi.fn();
    const onChunkCompleted = vi.fn((chunk: ChunkInfo) => {
      chunks.push(chunk);
    });
    const onChunkError = vi.fn();

    await streamSplitter(stream, {
      onChunkStarted,
      onChunkCompleted,
      onChunkError,
      options: { chunkSize: 20 },
    });

    expect(chunks).toHaveLength(3);
    expect(chunks[0].partNumber).toBe(1);
    expect(chunks[1].partNumber).toBe(2);
    expect(chunks[2].partNumber).toBe(3);
  });

  it("should handle multiple input chunks", async () => {
    const chunk1 = new Uint8Array([1, 2, 3, 4, 5]);
    const chunk2 = new Uint8Array([6, 7, 8, 9, 10]);
    const chunk3 = new Uint8Array([11, 12, 13, 14, 15]);
    const stream = createReadableStream([chunk1, chunk2, chunk3]);

    const chunks: ChunkInfo[] = [];
    const onChunkStarted = vi.fn();
    const onChunkCompleted = vi.fn((chunk: ChunkInfo) => {
      chunks.push(chunk);
    });
    const onChunkError = vi.fn();

    await streamSplitter(stream, {
      onChunkStarted,
      onChunkCompleted,
      onChunkError,
      options: { chunkSize: 7 },
    });

    expect(chunks).toHaveLength(3);
    expect(chunks[0].size).toBe(7);
    expect(chunks[1].size).toBe(7);
    expect(chunks[2].size).toBe(1);

    // Verify data integrity
    const allData = new Uint8Array(15);
    let offset = 0;
    for (const chunk of chunks) {
      allData.set(chunk.stream, offset);
      offset += chunk.stream.length;
    }
    expect(allData).toEqual(
      new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
    );
  });

  it("should call event handlers in correct order", async () => {
    const data = new Uint8Array(25).fill(1);
    const stream = createReadableStream([data]);

    const events: string[] = [];
    const onChunkStarted = vi.fn((partNumber: number) =>
      events.push(`start-${partNumber}`),
    );
    const onChunkCompleted = vi.fn((chunk: ChunkInfo) =>
      events.push(`complete-${chunk.partNumber}`),
    );
    const onChunkError = vi.fn();

    await streamSplitter(stream, {
      onChunkStarted,
      onChunkCompleted,
      onChunkError,
      options: { chunkSize: 10 },
    });

    expect(events).toEqual([
      "start-1",
      "complete-1",
      "start-2",
      "complete-2",
      "start-3",
      "complete-3",
    ]);
  });

  it("should handle stream read errors", async () => {
    const errorStream = new ReadableStream({
      pull(controller) {
        controller.error(new Error("Stream read error"));
      },
    });

    const onChunkStarted = vi.fn();
    const onChunkCompleted = vi.fn();
    const onChunkError = vi.fn();

    await expect(
      streamSplitter(errorStream, {
        onChunkStarted,
        onChunkCompleted,
        onChunkError,
        options: { chunkSize: 10 },
      }),
    ).rejects.toThrow("Stream read error");

    expect(onChunkError).toHaveBeenCalledOnce();
    expect(onChunkError).toHaveBeenCalledWith(1, expect.any(Error));
  });

  it("should preserve data across chunk boundaries", async () => {
    // Create data that doesn't align with chunk boundaries
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    const stream = createReadableStream([data]);

    const chunks: ChunkInfo[] = [];
    const onChunkStarted = vi.fn();
    const onChunkCompleted = vi.fn((chunk: ChunkInfo) => {
      chunks.push(chunk);
    });
    const onChunkError = vi.fn();

    await streamSplitter(stream, {
      onChunkStarted,
      onChunkCompleted,
      onChunkError,
      options: { chunkSize: 5 },
    });

    // Reconstruct original data
    const reconstructed = new Uint8Array(13);
    let offset = 0;
    for (const chunk of chunks) {
      reconstructed.set(chunk.stream, offset);
      offset += chunk.stream.length;
    }

    expect(reconstructed).toEqual(data);
    expect(chunks.map((c) => c.size)).toEqual([5, 5, 3]);
  });
});
