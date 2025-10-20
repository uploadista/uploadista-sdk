/**
 * Platform-agnostic file reader service
 */

export type SliceResult =
  | {
      done: true;
      value: null;
      size: null;
    }
  | {
      done: boolean;
      value: Uint8Array;
      size: number;
    };

export interface FileSource {
  input: unknown;
  size: number | null;
  name: string | null;
  type: string | null;
  lastModified: number | null;
  slice: (start: number, end: number) => Promise<SliceResult>;
  close: () => void;
}

export interface FileReaderService<UploadInput> {
  /**
   * Open a file for reading
   */
  openFile(input: UploadInput, chunkSize: number): Promise<FileSource>;
}

export interface Base64Service {
  /**
   * Encode data to base64
   */
  toBase64(data: ArrayBuffer): string;

  /**
   * Decode base64 to data
   */
  fromBase64(data: string): ArrayBuffer;
}
