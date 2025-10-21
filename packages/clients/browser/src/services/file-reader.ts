import type {
  FileSource as CoreFileSource,
  FileReaderService,
  SliceResult,
} from "@uploadista/client-core";
import type { BrowserUploadInput } from "../types/upload-input";

/**
 * Browser-specific file reader interface for opening and reading file data.
 *
 * Provides methods to open File/Blob objects and create FileSource instances
 * that support chunked reading for upload operations.
 */
export type FileReader = {
  /**
   * Opens a file and prepares it for chunked reading.
   *
   * @param input - The File or Blob to open
   * @param chunkSize - Size of chunks to read (in bytes)
   * @returns Promise resolving to a FileSource for reading the file
   */
  openFile: (
    input: BrowserUploadInput,
    chunkSize: number,
  ) => Promise<FileSource>;
};

/**
 * Represents an opened file that can be read in chunks.
 *
 * This interface provides the core functionality for reading file data
 * in a streaming fashion, which is essential for uploading large files
 * without loading them entirely into memory.
 */
export type FileSource = {
  /** The original input File or Blob */
  input: BrowserUploadInput;

  /** Total size of the file in bytes, or null if unknown */
  size: number | null;

  /**
   * Reads a slice of data from the file.
   *
   * @param start - Starting byte offset
   * @param end - Ending byte offset (exclusive)
   * @returns Promise resolving to the slice result with data and metadata
   */
  slice: (start: number, end: number) => Promise<SliceResult>;

  /**
   * Closes the file and releases any resources.
   *
   * For browser File/Blob objects, this is typically a no-op as there are
   * no resources to release, but is included for interface compatibility.
   */
  close: () => void;
};

/**
 * Re-export SliceResult from core for convenience.
 */
export type { SliceResult };

// Commented-out stream support for future implementation
// function isWebStream(
//   input: BrowserUploadInput,
// ): input is Pick<ReadableStreamDefaultReader, "read"> {
//   return (
//     typeof input === "object" &&
//     input !== null &&
//     "read" in input &&
//     typeof input.read === "function"
//   );
// }

/**
 * Creates a FileSource from a Blob or File object.
 *
 * This function wraps a Blob (or File, which extends Blob) and provides
 * a slice() method for reading specific byte ranges. It uses the Blob.slice()
 * and arrayBuffer() APIs to efficiently read file chunks without loading
 * the entire file into memory.
 *
 * @param blob - The Blob or File to wrap
 * @returns A FileSource that can read chunks from the blob
 *
 * @example
 * ```typescript
 * const file = new File(['content'], 'test.txt');
 * const source = blobFileSource(file);
 *
 * // Read first 1024 bytes
 * const chunk = await source.slice(0, 1024);
 * console.log('Chunk size:', chunk.size);
 * console.log('Is complete:', chunk.done);
 * ```
 */
function blobFileSource(blob: Blob): FileSource {
  return {
    input: blob,
    size: blob.size,
    slice: async (start: number, end: number) => {
      const value = blob.slice(start, end);
      const size = value.size;
      const done = end >= blob.size;

      return { value: new Uint8Array(await value.arrayBuffer()), size, done };
    },
    close: () => {},
  };
}

// Commented-out stream support code for future implementation
// export type StreamReader = Pick<ReadableStreamDefaultReader, "read">;

// type BlobOrArray = Blob | Uint8Array;

// function len(blobOrArray: BlobOrArray | undefined): number {
//   if (blobOrArray === undefined) return 0;
//   if (blobOrArray instanceof Blob) return blobOrArray.size;
//   return blobOrArray.length;
// }

// /*
//     Typed arrays and blobs don't have a concat method.
//     This function helps StreamSource accumulate data to reach chunkSize.
//   */
// function concat<T extends BlobOrArray | undefined>(a: T, b: T): T {
//   if (a instanceof Blob && b instanceof Blob) {
//     return new Blob([a, b], { type: a.type }) as T;
//   }
//   if (a instanceof Uint8Array && b instanceof Uint8Array) {
//     const c = new Uint8Array(a.length + b.length);
//     c.set(a);
//     c.set(b, a.length);
//     return c as T;
//   }
//   throw new Error("Unknown data type");
// }

// function removeDataBeforeStart(
//   buffer: Uint8Array | undefined,
//   bufferOffset: number,
//   start: number,
// ) {
//   if (buffer === undefined) {
//     throw new Error("cannot removeDataBeforeStart because buffer is unset");
//   }
//   if (start > bufferOffset) {
//     return buffer.slice(start - bufferOffset);
//   }
//   return buffer;
// }

// function getDataFromBuffer(
//   buffer: Uint8Array | undefined,
//   bufferOffset: number,
//   start: number,
//   end: number,
//   done: boolean,
// ) {
//   if (buffer === undefined) {
//     throw new Error("cannot getDataFromBuffer because buffer is unset");
//   }

//   // Remove data from buffer before `start`.
//   // Data might be reread from the buffer if an upload fails, so we can only
//   // safely delete data when it comes *before* what is currently being read.
//   const safeBuffer = removeDataBeforeStart(buffer, bufferOffset, start);

//   // If the buffer is empty after removing old data, all data has been read.
//   const hasAllDataBeenRead = len(safeBuffer) === 0;
//   if (done && hasAllDataBeenRead) {
//     return null;
//   }

//   // We already removed data before `start`, so we just return the first
//   // chunk from the buffer.
//   return safeBuffer.slice(0, end - start);
// }

// async function readUntilEnoughDataOrDone(
//   reader: StreamReader,
//   bufferOffset: number,
//   buffer: Uint8Array | undefined,
//   start: number,
//   end: number,
//   done: boolean,
// ): Promise<SliceResult> {
//   const hasEnoughData = end <= bufferOffset + len(buffer);
//   if (done || hasEnoughData) {
//     const value = getDataFromBuffer(buffer, bufferOffset, start, end, done);
//     if (value === null) {
//       return { value: null, size: null, done: true };
//     }

//     const size = value instanceof Blob ? value.size : value.length;
//     return Promise.resolve({ value, size, done });
//   }

//   let newDone: boolean = done;
//   let newBuffer: Uint8Array | undefined;
//   const { value, done: isDone } = await reader.read();

//   if (isDone) {
//     newDone = true;
//   } else if (buffer === undefined) {
//     newBuffer = value;
//   } else {
//     newBuffer = concat(buffer, value);
//   }

//   return readUntilEnoughDataOrDone(
//     reader,
//     bufferOffset,
//     newBuffer,
//     start,
//     end,
//     newDone,
//   );
// }

// function streamFileSource(reader: StreamReader): FileSource {
//   const bufferOffset = 0;
//   const buffer = new Uint8Array(0);

//   return {
//     input: reader,
//     size: null,
//     slice: (start: number, end: number) => {
//       if (start < bufferOffset) {
//         return Promise.reject(
//           new Error("Requested data is before the reader's current offset"),
//         );
//       }

//       return readUntilEnoughDataOrDone(
//         reader,
//         bufferOffset,
//         buffer,
//         start,
//         end,
//         false,
//       );
//     },
//     close: () => {
//       // TODO: We should not call cancel
//       // @ts-expect-error cancel is not defined since we only pick `read`
//       if (reader.cancel) {
//         // @ts-expect-error cancel is not defined since we only pick `read`
//         reader.cancel();
//       }
//     },
//   };
// }

/**
 * Creates a browser-specific file reader service for the Uploadista client.
 *
 * This service provides the ability to open and read File/Blob objects from
 * the browser's File API. It converts browser-native file objects into a
 * format that can be chunked and uploaded efficiently.
 *
 * The service currently supports:
 * - File objects from `<input type="file">` elements
 * - File objects from drag-and-drop events
 * - Blob objects created programmatically
 *
 * Future support may include:
 * - ReadableStream for streaming data
 *
 * @returns A FileReaderService configured for browser environments
 *
 * @example
 * ```typescript
 * import { createBrowserFileReaderService } from '@uploadista/client-browser';
 *
 * const fileReader = createBrowserFileReaderService();
 *
 * // Open a file from input element
 * const input = document.querySelector('input[type="file"]');
 * const file = input.files[0];
 * const source = await fileReader.openFile(file, 5 * 1024 * 1024); // 5MB chunks
 *
 * console.log('File name:', source.name);
 * console.log('File size:', source.size);
 * console.log('File type:', source.type);
 *
 * // Read first chunk
 * const chunk = await source.slice(0, 5 * 1024 * 1024);
 * console.log('Read', chunk.size, 'bytes');
 * ```
 *
 * @throws {Error} When the input is not a File or Blob
 */
export function createBrowserFileReaderService(): FileReaderService<BrowserUploadInput> {
  return {
    openFile: async (
      input: BrowserUploadInput,
      _chunkSize: number,
    ): Promise<CoreFileSource> => {
      // File is a subtype of Blob, so we can check for Blob here.
      if (input instanceof Blob) {
        const source = blobFileSource(input);
        return {
          input: source.input,
          size: source.size,
          slice: source.slice,
          close: source.close,
          name: source.input instanceof File ? source.input.name : null,
          type: source.input instanceof File ? source.input.type : null,
          lastModified:
            source.input instanceof File ? source.input.lastModified : null,
        };
      }

      // Future support for streams (commented out):
      // if (isWebStream(input)) {
      //   if (!Number.isFinite(chunkSize)) {
      //     throw new TypeError(
      //       "cannot create source for stream without a finite value for the `chunkSize` option",
      //     );
      //   }

      //   const source = streamFileSource(input);
      //   return {
      //     input: source.input,
      //     size: source.size,
      //     slice: source.slice,
      //     close: source.close,
      //     name: source.input instanceof File ? source.input.name : null,
      //     type: source.input instanceof File ? source.input.type : null,
      //     lastModified:
      //       source.input instanceof File ? source.input.lastModified : null,
      //   };
      // }

      throw new Error(
        "source object may only be an instance of File, Blob in this environment",
      );
    },
  };
}
