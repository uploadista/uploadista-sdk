import type { AbortControllerFactory } from "./abort-controller-service";
import type { ChecksumService } from "./checksum-service";
import type { Base64Service, FileReaderService } from "./file-reader-service";
import type { FingerprintService } from "./fingerprint-service";
import type { HttpClient } from "./http-client";
import type { IdGenerationService } from "./id-generation-service";
import type { PlatformService } from "./platform-service";
import type { StorageService } from "./storage-service";
import type { WebSocketFactory } from "./websocket-service";

/**
 * Service container for dependency injection in the Uploadista client.
 *
 * This container provides all platform-specific services needed by the upload client.
 * Different platforms (browser, React Native, Node.js) provide their own implementations
 * of these services to handle platform-specific APIs and behaviors.
 *
 * @template UploadInput - The type of input accepted by the file reader (e.g., File, Blob, string path)
 *
 * @example Browser implementation
 * ```typescript
 * const services: ServiceContainer<File | Blob> = {
 *   storage: new LocalStorageService(),
 *   idGeneration: new BrowserIdGenerationService(),
 *   httpClient: new FetchHttpClient(),
 *   fileReader: new BrowserFileReaderService(),
 *   base64: new BrowserBase64Service(),
 *   websocket: new BrowserWebSocketFactory(),
 *   abortController: new BrowserAbortControllerFactory(),
 *   platform: new BrowserPlatformService(),
 *   checksumService: new WebCryptoChecksumService(),
 *   fingerprintService: new BrowserFingerprintService(),
 * };
 * ```
 *
 * @example React Native implementation
 * ```typescript
 * const services: ServiceContainer<FilePickResult> = {
 *   storage: new AsyncStorageService(),
 *   idGeneration: new ReactNativeIdGenerationService(),
 *   httpClient: new FetchHttpClient(),
 *   fileReader: new ReactNativeFileReaderService(),
 *   websocket: new ReactNativeWebSocketFactory(),
 *   abortController: new ReactNativeAbortControllerFactory(),
 *   platform: new ReactNativePlatformService(),
 *   checksumService: new ReactNativeChecksumService(),
 *   fingerprintService: new ReactNativeFingerprintService(),
 * };
 * ```
 */
export interface ServiceContainer<UploadInput> {
  /**
   * Storage service for persisting upload state and metadata.
   *
   * **Required**: Yes
   *
   * **Used for**:
   * - Storing upload progress for resumption
   * - Caching upload fingerprints
   * - Persisting partial upload state across sessions
   *
   * **Platform implementations**:
   * - Browser: `localStorage`, `IndexedDB`
   * - React Native: `AsyncStorage`, `MMKV`
   * - Node.js: File system, Redis
   */
  storage: StorageService;

  /**
   * ID generation service for creating unique identifiers.
   *
   * **Required**: Yes
   *
   * **Used for**:
   * - Generating upload IDs
   * - Creating request correlation IDs
   * - Generating chunk identifiers
   *
   * **Platform implementations**:
   * - Browser: `crypto.randomUUID()` or fallback
   * - React Native: UUID libraries
   * - Node.js: `crypto.randomUUID()`
   */
  idGeneration: IdGenerationService;

  /**
   * HTTP client for making upload requests.
   *
   * **Required**: Yes
   *
   * **Used for**:
   * - Uploading file chunks
   * - Making API calls to the upload server
   * - Fetching upload metadata
   *
   * **Platform implementations**:
   * - Browser: `fetch()` with connection pooling
   * - React Native: `fetch()` or `XMLHttpRequest`
   * - Node.js: `node:http`, `node:https`, or libraries like `undici`
   *
   * **Important**: Should support connection pooling for optimal performance
   */
  httpClient: HttpClient;

  /**
   * File reader service for reading file contents.
   *
   * **Required**: Yes
   *
   * **Used for**:
   * - Reading file data for upload
   * - Slicing files into chunks
   * - Computing file checksums and fingerprints
   *
   * **Platform implementations**:
   * - Browser: `FileReader` API, `Blob.slice()`
   * - React Native: Native file system modules, `react-native-fs`
   * - Node.js: `fs.createReadStream()`, `fs.promises.open()`
   *
   * **Generic type**: Accepts platform-specific input types (File, Blob, path string)
   */
  fileReader: FileReaderService<UploadInput>;

  /**
   * Base64 encoding/decoding service.
   *
   * **Required**: No (optional)
   *
   * **Used for**:
   * - Encoding binary data for transport
   * - Decoding server responses
   * - Optional data transformations
   *
   * **Platform implementations**:
   * - Browser: `btoa()`, `atob()`
   * - React Native: `base64-js` or built-in
   * - Node.js: `Buffer.from().toString('base64')`
   *
   * **Note**: Only needed for specific upload protocols that require base64 encoding
   */
  base64?: Base64Service;

  /**
   * WebSocket factory for creating WebSocket connections.
   *
   * **Required**: Yes
   *
   * **Used for**:
   * - Real-time upload progress updates
   * - Server-side event notifications
   * - Live upload status from server
   *
   * **Platform implementations**:
   * - Browser: Native `WebSocket` API
   * - React Native: `react-native-websocket` or polyfills
   * - Node.js: `ws` library
   *
   * **Important**: Must support standard WebSocket protocol
   */
  websocket: WebSocketFactory;

  /**
   * Abort controller factory for creating cancellation tokens.
   *
   * **Required**: Yes
   *
   * **Used for**:
   * - Aborting in-flight upload requests
   * - Cancelling file read operations
   * - Implementing upload timeout logic
   *
   * **Platform implementations**:
   * - Browser: Native `AbortController` API
   * - React Native: `AbortController` polyfill
   * - Node.js: Native `AbortController` (Node 15+)
   */
  abortController: AbortControllerFactory;

  /**
   * Platform detection service.
   *
   * **Required**: Yes
   *
   * **Used for**:
   * - Detecting runtime environment (browser, React Native, Node.js)
   * - Applying platform-specific optimizations
   * - Conditional feature availability
   *
   * **Platform implementations**:
   * - Browser: Checks `window`, `document` availability
   * - React Native: Checks `navigator.product === 'ReactNative'`
   * - Node.js: Checks `process` availability
   */
  platform: PlatformService;

  /**
   * Checksum service for computing file checksums.
   *
   * **Required**: Yes
   *
   * **Used for**:
   * - Verifying upload integrity
   * - Detecting corrupted uploads
   * - Implementing upload deduplication
   *
   * **Platform implementations**:
   * - Browser: `crypto.subtle` Web Crypto API
   * - React Native: Native crypto modules or JavaScript implementations
   * - Node.js: `crypto` module
   *
   * **Common algorithms**: SHA-256, MD5, CRC32
   */
  checksumService: ChecksumService;

  /**
   * Fingerprint service for generating unique file identifiers.
   *
   * **Required**: Yes
   *
   * **Used for**:
   * - Upload resumption (matching partial uploads)
   * - Deduplication (detecting duplicate files)
   * - Cache key generation
   *
   * **Platform implementations**:
   * - Browser: Combines file metadata (size, name, modified date, first/last bytes)
   * - React Native: Similar to browser but uses platform-specific file APIs
   * - Node.js: File stat info + content sampling
   *
   * **Generic type**: Accepts platform-specific input types
   *
   * **Note**: Fingerprints should be stable (same file = same fingerprint) but
   * fast to compute (avoid reading entire file if possible)
   */
  fingerprintService: FingerprintService<UploadInput>;
}
