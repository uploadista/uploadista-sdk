import { describe, expect, it, vi } from "vitest";
import { UploadistaError } from "../../src/errors";
import { streamLimiter } from "../../src/streams/stream-limiter";

// Helper function to convert stream to array
async function streamToArray(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array[]> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

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

// Helper function to write data to stream
async function writeToStream(
  stream: WritableStream<Uint8Array>,
  data: Uint8Array[],
): Promise<void> {
  const writer = stream.getWriter();

  try {
    for (const chunk of data) {
      await writer.write(chunk);
    }
  } finally {
    await writer.close();
  }
}

describe("streamLimiter", () => {
  it("should create a TransformStream", () => {
    const limiter = streamLimiter({ maxSize: 1024 });
    expect(limiter).toBeInstanceOf(TransformStream);
  });

  it("should pass through data within size limit", async () => {
    const limiter = streamLimiter({ maxSize: 1024 });
    const testData = [new Uint8Array([1, 2, 3, 4, 5])];

    const writePromise = writeToStream(limiter.writable, testData);
    const readPromise = streamToArray(limiter.readable);

    const [, result] = await Promise.all([writePromise, readPromise]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(testData[0]);
  });

  it("should call onData callback for each chunk", async () => {
    const onDataCallback = vi.fn();
    const limiter = streamLimiter({ maxSize: 1024, onData: onDataCallback });

    const testData = [new Uint8Array([1, 2, 3])];

    const writePromise = writeToStream(limiter.writable, testData);
    const readPromise = streamToArray(limiter.readable);

    await Promise.all([writePromise, readPromise]);

    expect(onDataCallback).toHaveBeenCalledOnce();
    expect(onDataCallback).toHaveBeenCalledWith(testData[0].byteLength);
  });

  it("should work without onData callback", async () => {
    const limiter = streamLimiter({ maxSize: 1024 });
    const testData = [new Uint8Array([1, 2, 3])];

    const writePromise = writeToStream(limiter.writable, testData);
    const readPromise = streamToArray(limiter.readable);

    const [, result] = await Promise.all([writePromise, readPromise]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(testData[0]);
  });

  it("should handle zero-sized chunks", async () => {
    const onDataCallback = vi.fn();
    const limiter = streamLimiter({ maxSize: 1024, onData: onDataCallback });

    const testData = [new Uint8Array(0)];

    const writePromise = writeToStream(limiter.writable, testData);
    const readPromise = streamToArray(limiter.readable);

    const [, result] = await Promise.all([writePromise, readPromise]);

    expect(onDataCallback).toHaveBeenCalledWith(testData[0].byteLength);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(testData[0]);
  });

  it("should error when size limit is exceeded", async () => {
    const limiter = streamLimiter({ maxSize: 10 });
    const testData = [new Uint8Array(15).fill(1)]; // Exceeds limit of 10

    const writePromise = writeToStream(limiter.writable, testData);
    const readPromise = streamToArray(limiter.readable);

    await expect(
      Promise.all([writePromise, readPromise]),
    ).rejects.toBeInstanceOf(UploadistaError);
  });

  it("should track cumulative size across multiple chunks", async () => {
    const limiter = streamLimiter({ maxSize: 10 });

    // First chunk (5 bytes) + second chunk (3 bytes) = 8 bytes (within limit)
    // Third chunk (3 bytes) would make total 11 bytes (exceeds limit)
    const testData = [
      new Uint8Array(5).fill(1),
      new Uint8Array(3).fill(2),
      new Uint8Array(3).fill(3),
    ];

    const writePromise = writeToStream(limiter.writable, testData);
    const readPromise = streamToArray(limiter.readable);

    await expect(
      Promise.all([writePromise, readPromise]),
    ).rejects.toBeInstanceOf(UploadistaError);
  });

  it("should error with correct UploadistaError code", async () => {
    const limiter = streamLimiter({ maxSize: 5 });
    const testData = [new Uint8Array(10)];

    try {
      await Promise.all([
        writeToStream(limiter.writable, testData),
        streamToArray(limiter.readable),
      ]);
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect(error).toBeInstanceOf(UploadistaError);
      expect((error as UploadistaError).code).toBe("ERR_MAX_SIZE_EXCEEDED");
    }
  });
});
