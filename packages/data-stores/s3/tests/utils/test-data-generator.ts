import type { UploadistaError } from "@uploadista/core/errors";
import { Option, Stream } from "effect";

export interface TestFileSize {
  name: string;
  size: number;
  description: string;
}

export const TEST_FILE_SIZES: Record<string, TestFileSize> = {
  TINY: {
    name: "tiny",
    size: 1024, // 1KB
    description: "Tiny file for edge cases",
  },
  SMALL_BASIC: {
    name: "small-basic",
    size: 1024 * 1024, // 1MB
    description: "Basic small file",
  },
  SMALL_LARGE: {
    name: "small-large",
    size: Math.floor(4.9 * 1024 * 1024), // 4.9MB (just under S3 multipart threshold)
    description: "Large small file (single part)",
  },
  MEDIUM_MIN: {
    name: "medium-min",
    size: 5 * 1024 * 1024, // 5MB (S3 minimum multipart size)
    description: "Minimum medium file (multipart threshold)",
  },
  MEDIUM: {
    name: "medium",
    size: 10 * 1024 * 1024, // 10MB
    description: "Standard medium file",
  },
  MEDIUM_LARGE: {
    name: "medium-large",
    size: 49 * 1024 * 1024, // 49MB
    description: "Large medium file",
  },
  LARGE: {
    name: "large",
    size: 50 * 1024 * 1024, // 50MB
    description: "Standard large file",
  },
  LARGE_XL: {
    name: "large-xl",
    size: 100 * 1024 * 1024, // 100MB
    description: "Extra large file",
  },
  STRESS_TEST: {
    name: "stress-test",
    size: 200 * 1024 * 1024, // 200MB
    description: "Stress test file",
  },
} as const;

export interface TestFilePattern {
  type: "random" | "zeros" | "ones" | "pattern" | "text";
  pattern?: Uint8Array;
  seed?: number;
}

/**
 * Generate test data with different patterns for comprehensive testing
 */

/**
 * Generate random data with optional seed for reproducibility
 */
export function generateRandomData(size: number, seed?: number): Uint8Array {
  const data = new Uint8Array(size);

  if (seed !== undefined) {
    // Simple LCG for reproducible randomness
    let rng = seed;
    for (let i = 0; i < size; i++) {
      rng = (rng * 1664525 + 1013904223) >>> 0;
      data[i] = (rng >>> 24) & 0xff;
    }
  } else {
    // crypto.getRandomValues has a 65,536 byte limit, so we need to generate in chunks
    const maxChunkSize = 65536;
    let offset = 0;

    while (offset < size) {
      const chunkSize = Math.min(maxChunkSize, size - offset);
      const chunk = data.subarray(offset, offset + chunkSize);
      crypto.getRandomValues(chunk);
      offset += chunkSize;
    }
  }

  return data;
}

/**
 * Generate data filled with zeros (good for compression testing)
 */
export function generateZeroData(size: number): Uint8Array {
  return new Uint8Array(size);
}

/**
 * Generate data filled with ones
 */
export function generateOnesData(size: number): Uint8Array {
  const data = new Uint8Array(size);
  data.fill(255);
  return data;
}

/**
 * Generate data with repeating pattern
 */
export function generatePatternData(
  size: number,
  pattern: Uint8Array,
): Uint8Array {
  const data = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = pattern[i % pattern.length];
  }
  return data;
}

/**
 * Generate text-like data
 */
export function generateTextData(size: number): Uint8Array {
  const text = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ";
  const encoder = new TextEncoder();
  const baseData = encoder.encode(text);
  const data = new Uint8Array(size);

  for (let i = 0; i < size; i++) {
    data[i] = baseData[i % baseData.length];
  }

  return data;
}

/**
 * Generate data based on pattern configuration
 */
export function generateData(
  size: number,
  pattern: TestFilePattern,
): Uint8Array {
  switch (pattern.type) {
    case "random":
      return generateRandomData(size, pattern.seed);
    case "zeros":
      return generateZeroData(size);
    case "ones":
      return generateOnesData(size);
    case "pattern":
      if (!pattern.pattern) {
        throw new Error("Pattern must be provided for pattern type");
      }
      return generatePatternData(size, pattern.pattern);
    case "text":
      return generateTextData(size);
    default:
      throw new Error(`Unknown pattern type: ${pattern.type}`);
  }
}

/**
 * Create a stream from test data
 */
export const createTestDataStream = (
  size: number,
  pattern: TestFilePattern = { type: "random" },
  chunkSize: number = 64 * 1024, // 64KB chunks
): Stream.Stream<Uint8Array, UploadistaError> => {
  const data = generateData(size, pattern);

  return Stream.unfold(0, (offset) => {
    if (offset >= data.length) {
      return Option.none();
    }

    const end = Math.min(offset + chunkSize, data.length);
    const chunk = data.slice(offset, end);

    return Option.some([chunk, end] as const);
  });
};

/**
 * Create multiple streams for concurrent testing
 */
export const createMultipleTestStreams = (
  count: number,
  size: number,
  pattern: TestFilePattern = { type: "random" },
): Stream.Stream<Uint8Array, UploadistaError>[] => {
  return Array.from({ length: count }, (_, i) =>
    createTestDataStream(size, {
      ...pattern,
      seed: pattern.seed ? pattern.seed + i : i,
    }),
  );
};

/**
 * Utility to compare two Uint8Arrays for testing
 */
export const compareArrays = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
};

/**
 * Read all data from a stream for comparison
 */
export const streamToArray = async (
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLength += value.length;
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
};

/**
 * Create test files with metadata for comprehensive testing
 */
export interface TestFile {
  id: string;
  name: string;
  size: number;
  data: Uint8Array;
  stream: Stream.Stream<Uint8Array, UploadistaError>;
  pattern: TestFilePattern;
  metadata?: {
    contentType?: string;
    cacheControl?: string;
  };
}

export const createTestFile = (
  id: string,
  testSize: TestFileSize,
  pattern: TestFilePattern = { type: "random" },
  metadata?: TestFile["metadata"],
): TestFile => {
  const data = generateData(testSize.size, pattern);

  return {
    id,
    name: testSize.name,
    size: testSize.size,
    data,
    stream: createTestDataStream(testSize.size, pattern),
    pattern,
    metadata,
  };
};

/**
 * Create a set of standard test files for comprehensive testing
 */
export const createStandardTestFiles = (): TestFile[] => {
  return [
    createTestFile("tiny-random", TEST_FILE_SIZES.TINY, {
      type: "random",
      seed: 1,
    }),
    createTestFile("tiny-zeros", TEST_FILE_SIZES.TINY, { type: "zeros" }),
    createTestFile("small-basic", TEST_FILE_SIZES.SMALL_BASIC, {
      type: "random",
      seed: 2,
    }),
    createTestFile("small-large", TEST_FILE_SIZES.SMALL_LARGE, {
      type: "random",
      seed: 3,
    }),
    createTestFile("medium-min", TEST_FILE_SIZES.MEDIUM_MIN, {
      type: "random",
      seed: 4,
    }),
    createTestFile("medium", TEST_FILE_SIZES.MEDIUM, {
      type: "random",
      seed: 5,
    }),
    createTestFile("large", TEST_FILE_SIZES.LARGE, { type: "random", seed: 6 }),
    createTestFile(
      "text-file",
      TEST_FILE_SIZES.MEDIUM,
      { type: "text" },
      {
        contentType: "text/plain",
        cacheControl: "no-cache",
      },
    ),
    createTestFile("pattern-file", TEST_FILE_SIZES.MEDIUM, {
      type: "pattern",
      pattern: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    }),
  ];
};
