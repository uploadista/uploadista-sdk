import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Writes a Uint8Array to a temporary file
 * @param bytes - The bytes to write
 * @param extension - The file extension (without dot)
 * @returns The path to the temporary file
 */
export async function bytesToTempFile(
  bytes: Uint8Array,
  extension: string,
): Promise<string> {
  const tempPath = join(tmpdir(), `uploadista-${randomUUID()}.${extension}`);
  await fs.writeFile(tempPath, bytes);
  return tempPath;
}

/**
 * Reads a temporary file into a Uint8Array
 * @param path - The path to the file
 * @returns The file contents as Uint8Array
 */
export async function tempFileToBytes(path: string): Promise<Uint8Array> {
  const buffer = await fs.readFile(path);
  return new Uint8Array(buffer);
}

/**
 * Cleans up temporary files, suppressing errors
 * @param paths - The paths to delete
 */
export async function cleanup(paths: string[]): Promise<void> {
  await Promise.all(
    paths.map((p) =>
      fs.unlink(p).catch(() => {
        // Suppress errors during cleanup
      }),
    ),
  );
}
