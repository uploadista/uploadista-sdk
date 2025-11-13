import type { IOOutputCallbacks } from "node-av/api";

/**
 * Creates an in-memory output buffer that implements IOOutputCallbacks
 * @param _format - The output format (e.g., 'mp4', 'webm', 'jpeg') - not used but kept for API clarity
 * @returns IOOutputCallbacks and a function to get the accumulated data
 */
export function createMemoryOutput(): {
  callbacks: IOOutputCallbacks;
  getOutput: () => Uint8Array;
} {
  const chunks: Buffer[] = [];
  let position = 0n;

  const callbacks: IOOutputCallbacks = {
    write: (buffer: Buffer): number => {
      chunks.push(buffer);
      position += BigInt(buffer.length);
      return buffer.length;
    },
    seek: (offset: bigint, whence: number): bigint => {
      // For most formats, seeking is optional during muxing
      // We'll implement a basic version that tracks position
      // AVSEEK_SET = 0, AVSEEK_CUR = 1, AVSEEK_END = 2
      switch (whence) {
        case 0: // AVSEEK_SET
          position = offset;
          break;
        case 1: // AVSEEK_CUR
          position += offset;
          break;
        case 2: // AVSEEK_END
          // For end seeking, we'd need to know total size
          // Most streaming formats don't require this
          position = offset;
          break;
      }
      return position;
    },
  };

  const getOutput = (): Uint8Array => {
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  };

  return { callbacks, getOutput };
}
