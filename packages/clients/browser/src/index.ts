// Re-export everything from client-core
export * from "@uploadista/client-core";
export { createUploadistaClient, type UploadistaClientOptions } from "./client";
export * from "./framework-utils";
export { createHttpClient } from "./http-client";
export type { FileReader } from "./services/file-reader";
export { createBrowserFileReaderService } from "./services/file-reader";
export * from "./types";
