import { Stream } from "effect";

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
    size: Math.floor(4.9 * 1024 * 1024), // 4.9MB
    description: "Large small file",
  },
  MEDIUM_MIN: {
    name: "medium-min",
    size: 5 * 1024 * 1024, // 5MB
    description: "Minimum medium file",
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
} as const;

export interface TestFilePattern {
  type: "random" | "zeros" | "ones" | "pattern" | "text";
  pattern?: Uint8Array;
  seed?: number;
}

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
 * Generate data filled with zeros
 */
export function generateZeroData(size: number): Uint8Array {
  return new Uint8Array(size);
}

/**
 * Generate data filled with ones
 */
export function generateOnesData(size: number): Uint8Array {
  const data = new Uint8Array(size);
  data.fill(0xff);
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
 * Generate text data
 */
export function generateTextData(size: number): Uint8Array {
  const text = "The quick brown fox jumps over the lazy dog. ";
  const encoder = new TextEncoder();
  const pattern = encoder.encode(text);
  return generatePatternData(size, pattern);
}

/**
 * Generate test data based on pattern specification
 */
export function generateData(
  size: number,
  pattern?: TestFilePattern,
): Uint8Array {
  if (!pattern) {
    return generateRandomData(size);
  }

  switch (pattern.type) {
    case "random":
      return generateRandomData(size, pattern.seed);
    case "zeros":
      return generateZeroData(size);
    case "ones":
      return generateOnesData(size);
    case "pattern":
      return generatePatternData(size, pattern.pattern || new Uint8Array([0]));
    case "text":
      return generateTextData(size);
    default:
      return generateRandomData(size);
  }
}

/**
 * Create an Effect Stream from test data
 */
export function createTestDataStream(
  size: number,
  pattern?: TestFilePattern,
  chunkSize = 64 * 1024, // 64KB chunks by default
): Stream.Stream<Uint8Array, never, never> {
  const data = generateData(size, pattern);

  return Stream.make(...chunkData(data, chunkSize));
}

/**
 * Split data into chunks
 */
function chunkData(data: Uint8Array, chunkSize: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  let offset = 0;

  while (offset < data.byteLength) {
    const size = Math.min(chunkSize, data.byteLength - offset);
    chunks.push(data.subarray(offset, offset + size));
    offset += size;
  }

  return chunks;
}

/**
 * Compare two Uint8Arrays
 */
export function compareArrays(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }

  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Create standard test files with different patterns
 */
export function createStandardTestFiles() {
  return [
    {
      id: "test-zeros",
      size: TEST_FILE_SIZES.SMALL_BASIC.size,
      stream: createTestDataStream(TEST_FILE_SIZES.SMALL_BASIC.size, {
        type: "zeros",
      }),
      data: generateZeroData(TEST_FILE_SIZES.SMALL_BASIC.size),
      metadata: { contentType: "application/octet-stream" },
    },
    {
      id: "test-ones",
      size: TEST_FILE_SIZES.SMALL_BASIC.size,
      stream: createTestDataStream(TEST_FILE_SIZES.SMALL_BASIC.size, {
        type: "ones",
      }),
      data: generateOnesData(TEST_FILE_SIZES.SMALL_BASIC.size),
      metadata: { contentType: "application/octet-stream" },
    },
    {
      id: "test-pattern",
      size: TEST_FILE_SIZES.SMALL_BASIC.size,
      stream: createTestDataStream(TEST_FILE_SIZES.SMALL_BASIC.size, {
        type: "pattern",
        pattern: new Uint8Array([0xaa, 0xbb, 0xcc]),
      }),
      data: generatePatternData(
        TEST_FILE_SIZES.SMALL_BASIC.size,
        new Uint8Array([0xaa, 0xbb, 0xcc]),
      ),
      metadata: { contentType: "application/octet-stream" },
    },
    {
      id: "test-text",
      size: TEST_FILE_SIZES.SMALL_BASIC.size,
      stream: createTestDataStream(TEST_FILE_SIZES.SMALL_BASIC.size, {
        type: "text",
      }),
      data: generateTextData(TEST_FILE_SIZES.SMALL_BASIC.size),
      metadata: { contentType: "text/plain" },
    },
    {
      id: "test-random-seeded",
      size: TEST_FILE_SIZES.SMALL_BASIC.size,
      stream: createTestDataStream(TEST_FILE_SIZES.SMALL_BASIC.size, {
        type: "random",
        seed: 42,
      }),
      data: generateRandomData(TEST_FILE_SIZES.SMALL_BASIC.size, 42),
      metadata: { contentType: "application/octet-stream" },
    },
  ];
}
