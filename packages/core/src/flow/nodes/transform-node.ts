import { Effect, Stream } from "effect";
import type { UploadistaError } from "../../errors";
import type { StreamingConfig, UploadFile } from "../../types";
import { DEFAULT_STREAMING_CONFIG, uploadFileSchema } from "../../types";
import { UploadEngine } from "../../upload";
import { createFlowNode, NodeType } from "../node";
import { completeNodeExecution, type FileNamingConfig } from "../types";
import type { FlowCircuitBreakerConfig } from "../types/flow-types";
import { applyFileNaming, buildNamingContext } from "../utils/file-naming";
import { resolveUploadMetadata } from "../utils/resolve-upload-metadata";

/**
 * Transform mode for controlling how file data is processed.
 *
 * - `buffered`: Always load entire file into memory before transforming (default, backward compatible)
 * - `streaming`: Process file as a stream of chunks for memory efficiency
 * - `auto`: Automatically select mode based on file size and DataStore capabilities
 */
export type TransformMode = "buffered" | "streaming" | "auto";

/**
 * Result type for streaming transforms.
 * Can return just the transformed stream, or include metadata changes.
 */
export type StreamingTransformResult =
  | Stream.Stream<Uint8Array, UploadistaError>
  | {
      stream: Stream.Stream<Uint8Array, UploadistaError>;
      type?: string;
      fileName?: string;
      /** Estimated output size in bytes (for progress tracking) */
      estimatedSize?: number;
    };

/**
 * Function type for streaming transforms.
 * Receives an input stream and file metadata, returns a transformed stream.
 */
export type StreamingTransformFn = (
  stream: Stream.Stream<Uint8Array, UploadistaError>,
  file: UploadFile,
) => Effect.Effect<StreamingTransformResult, UploadistaError>;

/**
 * Configuration object for creating a transform node.
 */
export interface TransformNodeConfig {
  /** Unique identifier for the node */
  id: string;
  /** Human-readable name for the node */
  name: string;
  /** Description of what the node does */
  description: string;
  /** Optional output type ID from outputTypeRegistry for result type registration */
  outputTypeId?: string;
  /**
   * Whether to keep this node's output as a flow result even if it has outgoing edges.
   * When true, the node's output will be included in the final flow outputs alongside topology sinks.
   * Defaults to false.
   */
  keepOutput?: boolean;
  /**
   * Optional file naming configuration.
   * - undefined: Preserve original filename (backward compatible)
   * - mode: 'auto': Generate smart suffix based on node type
   * - mode: 'custom': Use template pattern or rename function
   */
  naming?: FileNamingConfig;
  /**
   * Node type identifier used for auto-naming context.
   * Defaults to "transform" if not specified.
   */
  nodeType?: string;
  /**
   * Stable node type identifier for circuit breaker configuration.
   * Used to share circuit breaker state across nodes of the same type
   * and for nodeTypeOverrides in flow config.
   * Example: "describe-image", "remove-background", "scan-virus"
   */
  nodeTypeId?: string;
  /**
   * Additional variables to include in the naming context.
   * These are merged with the base context (flowId, jobId, etc.)
   * and can be used in templates.
   */
  namingVars?: Record<string, string | number | undefined>;
  /**
   * Circuit breaker configuration for resilience against external service failures.
   * Overrides flow-level circuit breaker defaults for this node.
   */
  circuitBreaker?: FlowCircuitBreakerConfig;
  /**
   * Transform mode controlling how file data is processed.
   * - `buffered`: Always load entire file into memory
   * - `streaming`: Process file as a stream of chunks
   * - `auto`: Select mode based on file size and DataStore capabilities (default)
   *
   * @default "auto"
   */
  mode?: TransformMode;
  /**
   * Configuration for streaming mode (file size threshold, chunk size).
   * Only used when mode is "streaming" or "auto".
   */
  streamingConfig?: StreamingConfig;
  /**
   * Function that transforms file bytes (buffered mode).
   * Required unless streamingTransform is provided and mode is "streaming".
   */
  transform?: (
    bytes: Uint8Array,
    file: UploadFile,
  ) => Effect.Effect<
    | Uint8Array
    | {
        bytes: Uint8Array;
        type?: string;
        fileName?: string;
        metadata?: Record<string, unknown>;
      },
    UploadistaError
  >;
  /**
   * Function that transforms file as a stream (streaming mode).
   * For memory-efficient processing of large files.
   * Used when mode is "streaming" or when "auto" selects streaming.
   */
  streamingTransform?: StreamingTransformFn;
}

/**
 * Helper to check if a StreamingTransformResult is a stream or an object with metadata.
 */
function isStreamResult(
  result: StreamingTransformResult,
): result is Stream.Stream<Uint8Array, UploadistaError> {
  // Check if it has the 'stream' property (object form) vs is a Stream directly
  return !("stream" in result);
}

/**
 * Creates a transform node that handles the common pattern of:
 * 1. Reading bytes from an UploadFile
 * 2. Transforming the bytes
 * 3. Uploading the result as a new UploadFile
 *
 * This simplifies nodes that just need to transform file bytes without
 * worrying about upload server interactions.
 *
 * Supports both buffered and streaming modes:
 * - **Buffered mode**: Loads entire file into memory, transforms, uploads
 * - **Streaming mode**: Processes file as chunks for memory efficiency with large files
 * - **Auto mode** (default): Selects mode based on file size and DataStore capabilities
 *
 * @param config - Configuration object for the transform node
 * @returns An Effect that creates a flow node configured for file transformation
 *
 * @example
 * ```typescript
 * // Create a transform node with auto mode (default) - uses streaming for large files
 * const resizeNode = yield* createTransformNode({
 *   id: "resize-image",
 *   name: "Resize Image",
 *   description: "Resizes images to specified dimensions",
 *   transform: (bytes, file) => {
 *     // Your transformation logic here
 *     return Effect.succeed(transformedBytes);
 *   },
 *   streamingTransform: (stream, file) => {
 *     const transformed = Stream.map(stream, (chunk) => processChunk(chunk));
 *     return Effect.succeed(transformed);
 *   }
 * });
 *
 * // Force buffered mode for specific use cases
 * const bufferedNode = yield* createTransformNode({
 *   id: "optimize-small",
 *   name: "Optimize Small Files",
 *   description: "Optimizes small files with buffered mode",
 *   mode: "buffered",
 *   transform: (bytes, file) => Effect.succeed(transformBytes(bytes)),
 * });
 *
 * // Force streaming mode for memory efficiency
 * const streamingNode = yield* createTransformNode({
 *   id: "optimize-large",
 *   name: "Optimize Large Files",
 *   description: "Optimizes large files with streaming",
 *   mode: "streaming",
 *   streamingTransform: (stream, file) => {
 *     const transformed = Stream.map(stream, (chunk) => processChunk(chunk));
 *     return Effect.succeed(transformed);
 *   }
 * });
 * ```
 */
export function createTransformNode({
  id,
  name,
  description,
  outputTypeId,
  keepOutput,
  naming,
  nodeType: namingNodeType = "transform",
  nodeTypeId,
  namingVars,
  circuitBreaker,
  mode = "auto",
  streamingConfig,
  transform,
  streamingTransform,
}: TransformNodeConfig) {
  // Validate configuration
  if (mode === "streaming" && !streamingTransform) {
    throw new Error(
      `Transform node "${id}": mode is "streaming" but no streamingTransform function provided`,
    );
  }
  if (mode === "buffered" && !transform) {
    throw new Error(
      `Transform node "${id}": mode is "buffered" but no transform function provided`,
    );
  }
  if (mode === "auto" && !transform && !streamingTransform) {
    throw new Error(
      `Transform node "${id}": mode is "auto" but neither transform nor streamingTransform provided`,
    );
  }

  // Merge streaming config with defaults
  const effectiveStreamingConfig = {
    ...DEFAULT_STREAMING_CONFIG,
    ...streamingConfig,
  };

  return Effect.gen(function* () {
    const uploadEngine = yield* UploadEngine;

    return yield* createFlowNode<UploadFile, UploadFile>({
      id,
      name,
      description,
      type: NodeType.process,
      outputTypeId,
      keepOutput,
      nodeTypeId,
      circuitBreaker,
      inputSchema: uploadFileSchema,
      outputSchema: uploadFileSchema,
      run: ({ data: file, storageId, flowId, jobId, clientId }) => {
        return Effect.gen(function* () {
          const flow = {
            flowId,
            nodeId: id,
            jobId,
          };

          // Determine which mode to use
          const shouldUseStreaming = yield* Effect.gen(function* () {
            if (mode === "buffered") return false;
            if (mode === "streaming") return true;

            // Auto mode: check file size and capabilities
            const fileSize = file.size ?? 0;
            const threshold = effectiveStreamingConfig.fileSizeThreshold;

            // If file is smaller than threshold, use buffered
            if (fileSize > 0 && fileSize < threshold) {
              yield* Effect.logDebug(
                `File ${file.id} (${fileSize} bytes) below threshold (${threshold}), using buffered mode`,
              );
              return false;
            }

            // Check if we have the required functions
            if (!streamingTransform) {
              yield* Effect.logDebug(
                `No streamingTransform function, using buffered mode`,
              );
              return false;
            }

            // Check DataStore capabilities via UploadEngine
            const capabilities = yield* uploadEngine.getCapabilities(
              storageId,
              clientId,
            );
            if (!capabilities.supportsStreamingRead) {
              yield* Effect.logDebug(
                `DataStore doesn't support streaming read, using buffered mode`,
              );
              return false;
            }

            yield* Effect.logDebug(
              `File ${file.id} qualifies for streaming mode`,
            );
            return true;
          });

          const { type, fileName, metadata, metadataJson } =
            resolveUploadMetadata(file.metadata);

          if (shouldUseStreaming && streamingTransform) {
            // STREAMING PATH - True end-to-end streaming
            yield* Effect.logDebug(`Using streaming transform for ${file.id}`);

            // Get input stream
            const inputStream = yield* uploadEngine.readStream(
              file.id,
              clientId,
              effectiveStreamingConfig,
            );

            // Transform the stream
            const transformResult = yield* streamingTransform(
              inputStream,
              file,
            );

            // Extract stream and metadata from result
            const outputStream = isStreamResult(transformResult)
              ? transformResult
              : transformResult.stream;
            const outputType = isStreamResult(transformResult)
              ? undefined
              : transformResult.type;
            const estimatedSize = isStreamResult(transformResult)
              ? undefined
              : transformResult.estimatedSize;

            // Get fileName from transform result or apply naming config
            let outputFileName = isStreamResult(transformResult)
              ? undefined
              : transformResult.fileName;

            if (!outputFileName && naming) {
              const namingContext = buildNamingContext(
                file,
                { flowId, jobId, nodeId: id, nodeType: namingNodeType },
                namingVars,
              );
              outputFileName = applyFileNaming(file, namingContext, naming);
            }

            // Check if DataStore supports streaming writes
            const capabilities = yield* uploadEngine.getCapabilities(
              storageId,
              clientId,
            );

            let result: UploadFile;

            if (capabilities.supportsStreamingWrite) {
              // True end-to-end streaming: pipe transform output directly to storage
              yield* Effect.logDebug(
                `Using streaming write for ${file.id} - no intermediate buffering`,
              );

              result = yield* uploadEngine.uploadStream(
                {
                  storageId,
                  uploadLengthDeferred: true,
                  sizeHint: estimatedSize,
                  type: outputType ?? type,
                  fileName: outputFileName ?? fileName,
                  lastModified: 0,
                  metadata: metadataJson,
                  flow,
                },
                clientId,
                outputStream,
              );
            } else {
              // Fallback: buffer the output before uploading
              // This path is for DataStores that don't support streaming writes
              yield* Effect.logDebug(
                `Falling back to buffered upload for ${file.id} (streaming write not supported)`,
              );

              const outputChunks: Uint8Array[] = [];
              yield* Stream.runForEach(outputStream, (chunk) =>
                Effect.sync(() => {
                  outputChunks.push(chunk);
                }),
              );

              // Concatenate chunks into a single Uint8Array
              const totalLength = outputChunks.reduce(
                (sum, chunk) => sum + chunk.byteLength,
                0,
              );
              const outputBytes = new Uint8Array(totalLength);
              let offset = 0;
              for (const chunk of outputChunks) {
                outputBytes.set(chunk, offset);
                offset += chunk.byteLength;
              }

              // Create a ReadableStream for upload
              const bufferedUploadStream = new ReadableStream({
                start(controller) {
                  controller.enqueue(outputBytes);
                  controller.close();
                },
              });

              result = yield* uploadEngine.upload(
                {
                  storageId,
                  size: outputBytes.byteLength,
                  type: outputType ?? type,
                  fileName: outputFileName ?? fileName,
                  lastModified: 0,
                  metadata: metadataJson,
                  flow,
                },
                clientId,
                bufferedUploadStream,
              );
            }

            // Merge updated metadata
            const updatedMetadata = metadata
              ? {
                  ...metadata,
                  ...(outputType && {
                    mimeType: outputType,
                    type: outputType,
                    "content-type": outputType,
                  }),
                  ...(outputFileName && {
                    fileName: outputFileName,
                    originalName: outputFileName,
                    name: outputFileName,
                    extension:
                      outputFileName.split(".").pop() || metadata.extension,
                  }),
                }
              : result.metadata;

            return completeNodeExecution(
              updatedMetadata
                ? { ...result, metadata: updatedMetadata }
                : result,
            );
          }

          // BUFFERED PATH (default, backward compatible)
          if (!transform) {
            throw new Error(
              `Transform node "${id}": buffered mode selected but no transform function provided`,
            );
          }

          // Read input bytes from upload server
          const inputBytes = yield* uploadEngine.read(file.id, clientId);

          // Transform the bytes using the provided function
          const transformResult = yield* transform(inputBytes, file);

          // Handle both simple Uint8Array and object with metadata
          const outputBytes =
            transformResult instanceof Uint8Array
              ? transformResult
              : transformResult.bytes;

          const outputType =
            transformResult instanceof Uint8Array
              ? undefined
              : transformResult.type;

          // Get fileName from transform result (if provided) or apply naming config
          let outputFileName =
            transformResult instanceof Uint8Array
              ? undefined
              : transformResult.fileName;

          // Get metadata from transform result if provided
          const outputMetadata =
            transformResult instanceof Uint8Array
              ? undefined
              : transformResult.metadata;

          // Apply file naming if configured and no explicit fileName from transform
          if (!outputFileName && naming) {
            const namingContext = buildNamingContext(
              file,
              {
                flowId,
                jobId,
                nodeId: id,
                nodeType: namingNodeType,
              },
              namingVars,
            );
            outputFileName = applyFileNaming(file, namingContext, naming);
          }

          // Create a stream from the output bytes
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(outputBytes);
              controller.close();
            },
          });

          // Upload the transformed bytes back to the upload server
          // Use output metadata if provided, otherwise fall back to original
          const result = yield* uploadEngine.upload(
            {
              storageId,
              size: outputBytes.byteLength,
              type: outputType ?? type,
              fileName: outputFileName ?? fileName,
              lastModified: 0,
              metadata: metadataJson,
              flow,
            },
            clientId,
            stream,
          );

          // Merge updated metadata with result
          const updatedMetadata = metadata
            ? {
                ...metadata,
                // Merge transform-returned metadata (e.g., virusScan results)
                ...outputMetadata,
                // Update mimeType and related fields if type changed
                ...(outputType && {
                  mimeType: outputType,
                  type: outputType,
                  "content-type": outputType,
                }),
                // Update fileName and related fields if fileName changed
                ...(outputFileName && {
                  fileName: outputFileName,
                  originalName: outputFileName,
                  name: outputFileName,
                  // Update extension based on new fileName
                  extension:
                    outputFileName.split(".").pop() || metadata.extension,
                }),
              }
            : result.metadata;

          return completeNodeExecution(
            updatedMetadata
              ? {
                  ...result,
                  metadata: updatedMetadata,
                }
              : result,
          );
        });
      },
    });
  });
}
