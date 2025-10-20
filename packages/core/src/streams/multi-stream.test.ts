import { describe, expect, it } from "vitest";
import { MultiStream } from "./multi-stream";

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

function createAsyncReadableStream(
  data: Uint8Array[],
  delay = 10,
): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({
    async pull(controller) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (index < data.length) {
        controller.enqueue(data[index++]);
      } else {
        controller.close();
      }
    },
  });
}

async function readAllChunks(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return chunks;
}

describe("MultiStream", () => {
  it("should combine multiple streams sequentially", async () => {
    const stream1 = createReadableStream([
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6]),
    ]);

    const stream2 = createReadableStream([
      new Uint8Array([7, 8, 9]),
      new Uint8Array([10, 11, 12]),
    ]);

    const multiStream = new MultiStream([stream1, stream2]);
    const chunks = await readAllChunks(multiStream.readable);

    expect(chunks).toHaveLength(4);
    expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3]));
    expect(chunks[1]).toEqual(new Uint8Array([4, 5, 6]));
    expect(chunks[2]).toEqual(new Uint8Array([7, 8, 9]));
    expect(chunks[3]).toEqual(new Uint8Array([10, 11, 12]));
  });

  it("should handle empty streams", async () => {
    const stream1 = createReadableStream([]);
    const stream2 = createReadableStream([new Uint8Array([1, 2, 3])]);
    const stream3 = createReadableStream([]);

    const multiStream = new MultiStream([stream1, stream2, stream3]);
    const chunks = await readAllChunks(multiStream.readable);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("should handle single stream", async () => {
    const stream = createReadableStream([
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6]),
    ]);

    const multiStream = new MultiStream([stream]);
    const chunks = await readAllChunks(multiStream.readable);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3]));
    expect(chunks[1]).toEqual(new Uint8Array([4, 5, 6]));
  });

  it("should handle no streams", async () => {
    const multiStream = new MultiStream([]);
    const chunks = await readAllChunks(multiStream.readable);

    expect(chunks).toHaveLength(0);
  });

  it("should handle streams with different timing", async () => {
    const stream1 = createAsyncReadableStream([new Uint8Array([1, 2, 3])], 5);

    const stream2 = createAsyncReadableStream([new Uint8Array([4, 5, 6])], 15);

    const multiStream = new MultiStream([stream1, stream2]);
    const chunks = await readAllChunks(multiStream.readable);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3]));
    expect(chunks[1]).toEqual(new Uint8Array([4, 5, 6]));
  });

  it("should handle stream errors", async () => {
    const stream1 = createReadableStream([new Uint8Array([1, 2, 3])]);
    const stream2 = new ReadableStream({
      pull(controller) {
        controller.error(new Error("Stream error"));
      },
    });

    const multiStream = new MultiStream([stream1, stream2]);

    await expect(readAllChunks(multiStream.readable)).rejects.toThrow(
      "Stream error",
    );
  });

  it("should handle cancellation", async () => {
    const stream1 = createAsyncReadableStream(
      [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])],
      100,
    );

    const stream2 = createAsyncReadableStream([new Uint8Array([7, 8, 9])], 100);

    const multiStream = new MultiStream([stream1, stream2]);
    const reader = multiStream.readable.getReader();

    // Read first chunk
    const { value } = await reader.read();
    expect(value).toEqual(new Uint8Array([1, 2, 3]));

    // Cancel the stream
    await reader.cancel("Test cancellation");
    reader.releaseLock();
  });

  it("should handle large number of streams", async () => {
    const streams: ReadableStream<Uint8Array>[] = [];
    const expectedChunks: Uint8Array[] = [];

    for (let i = 0; i < 10; i++) {
      const chunk = new Uint8Array([i, i + 10]);
      expectedChunks.push(chunk);
      streams.push(createReadableStream([chunk]));
    }

    const multiStream = new MultiStream(streams);
    const chunks = await readAllChunks(multiStream.readable);

    expect(chunks).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect(chunks[i]).toEqual(expectedChunks[i]);
    }
  });

  it("should handle streams with multiple chunks each", async () => {
    const stream1 = createReadableStream([
      new Uint8Array([1]),
      new Uint8Array([2]),
      new Uint8Array([3]),
    ]);

    const stream2 = createReadableStream([
      new Uint8Array([4]),
      new Uint8Array([5]),
    ]);

    const stream3 = createReadableStream([
      new Uint8Array([6]),
      new Uint8Array([7]),
      new Uint8Array([8]),
      new Uint8Array([9]),
    ]);

    const multiStream = new MultiStream([stream1, stream2, stream3]);
    const chunks = await readAllChunks(multiStream.readable);

    expect(chunks).toHaveLength(9);
    for (let i = 0; i < 9; i++) {
      expect(chunks[i]).toEqual(new Uint8Array([i + 1]));
    }
  });

  it("should create object mode stream", () => {
    const stream1 = createReadableStream([new Uint8Array([1, 2, 3])]);
    const multiStream = MultiStream.obj([stream1]);

    expect(multiStream).toBeInstanceOf(MultiStream);
    expect(multiStream.readable).toBeInstanceOf(ReadableStream);
  });

  it("should handle backpressure correctly", async () => {
    const slowStream = new ReadableStream<Uint8Array>({
      start() {
        // Don't enqueue immediately
      },
      pull(controller) {
        // Simulate slow data arrival
        setTimeout(() => {
          if (!controller.desiredSize || controller.desiredSize > 0) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.close();
          }
        }, 10);
      },
    });

    const multiStream = new MultiStream([slowStream]);
    const chunks = await readAllChunks(multiStream.readable);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(new Uint8Array([1, 2, 3]));
  });
});
