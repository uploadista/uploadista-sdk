import { pipeline, Readable, Transform } from "node:stream";
import { type Bucket, Storage } from "@google-cloud/storage";
import { UploadistaError } from "@uploadista/core/errors";
import { Effect, Layer } from "effect";
import {
  type GCSClientConfig,
  GCSClientService,
  type GCSObjectMetadata,
  type GCSOperationContext,
} from "./gcs-client.service";

function createNodeJSGCSClient(config: GCSClientConfig) {
  // Dynamic import to avoid issues in non-Node environments

  const storage = new Storage({
    keyFilename: config.keyFilename,
    credentials: config.credentials,
    projectId: config.projectId,
  });

  const bucket: Bucket = storage.bucket(config.bucket);

  const getObject = (key: string) =>
    Effect.tryPromise({
      try: async () => {
        const file = bucket.file(key);
        const stream = file.createReadStream();

        // Convert Node.js stream to Web ReadableStream
        return new ReadableStream({
          start(controller) {
            stream.on("data", (chunk) => {
              controller.enqueue(new Uint8Array(chunk));
            });

            stream.on("end", () => {
              controller.close();
            });

            stream.on("error", (error) => {
              controller.error(error);
            });
          },
        });
      },
      catch: (error) => {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === 404
        ) {
          return UploadistaError.fromCode("FILE_NOT_FOUND");
        }
        return UploadistaError.fromCode("UNKNOWN_ERROR", { cause: error });
      },
    });

  const getObjectMetadata = (key: string) =>
    Effect.tryPromise({
      try: async () => {
        const file = bucket.file(key);
        const [metadata] = await file.getMetadata();

        const parseMetadata = (
          meta: Record<string, string | number | boolean | null> | undefined,
        ) => {
          if (!meta) return {};
          if (typeof meta.metadata === "string") {
            try {
              return JSON.parse(meta.metadata);
            } catch {
              return meta;
            }
          }
          return meta;
        };

        return {
          name: metadata.name,
          bucket: metadata.bucket,
          size: metadata.size
            ? Number.parseInt(`${metadata.size}`, 10)
            : undefined,
          contentType: metadata.contentType,
          metadata: parseMetadata(metadata.metadata),
          generation: metadata.generation,
          timeCreated: metadata.timeCreated,
          updated: metadata.updated,
        } as GCSObjectMetadata;
      },
      catch: (error) => {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === 404
        ) {
          return UploadistaError.fromCode("FILE_NOT_FOUND");
        }
        return UploadistaError.fromCode("UNKNOWN_ERROR", { cause: error });
      },
    });

  const objectExists = (key: string) =>
    Effect.tryPromise({
      try: async () => {
        const file = bucket.file(key);
        const [exists] = await file.exists();
        return exists;
      },
      catch: (error) => {
        return UploadistaError.fromCode("UNKNOWN_ERROR", { cause: error });
      },
    });

  const putObject = (
    key: string,
    body: Uint8Array,
    context?: Partial<GCSOperationContext>,
  ) =>
    Effect.tryPromise({
      try: async () => {
        return new Promise<string>((resolve, reject) => {
          const file = bucket.file(key);
          const options = {
            metadata: {
              contentType: context?.contentType || "application/octet-stream",
              metadata: context?.metadata || {},
            },
          };

          const stream = file.createWriteStream(options);

          stream.on("error", reject);
          stream.on("finish", () => {
            resolve(file.name);
          });

          stream.end(Buffer.from(body));
        });
      },
      catch: (error) => {
        return UploadistaError.fromCode("FILE_WRITE_ERROR", { cause: error });
      },
    });

  const putObjectFromStream = (
    key: string,
    offset: number,
    readableStream: ReadableStream,
    context?: Partial<GCSOperationContext>,
    onProgress?: (chunkSize: number) => void, // Called with incremental bytes per chunk
  ) =>
    Effect.tryPromise({
      try: async () => {
        return new Promise<number>((resolve, reject) => {
          const file = bucket.file(key);
          const options = {
            metadata: {
              contentType: context?.contentType || "application/octet-stream",
              metadata: context?.metadata || {},
            },
          };

          const writeStream = file.createWriteStream(options);
          let bytesWritten = offset;

          const transform = new Transform({
            transform(
              chunk: Buffer,
              _: string,
              callback: (error?: Error | null, data?: Buffer) => void,
            ) {
              bytesWritten += chunk.length;
              onProgress?.(bytesWritten);
              callback(null, chunk);
            },
          });

          const nodeReadable = Readable.fromWeb(readableStream);

          pipeline(
            nodeReadable,
            transform,
            writeStream,
            (error: Error | null) => {
              if (error) {
                reject(
                  UploadistaError.fromCode("FILE_WRITE_ERROR", {
                    cause: error,
                  }),
                );
              } else {
                resolve(bytesWritten);
              }
            },
          );
        });
      },
      catch: (error) => {
        console.error("error putting object from stream", error);
        return UploadistaError.fromCode("FILE_WRITE_ERROR", { cause: error });
      },
    });

  const deleteObject = (key: string) =>
    Effect.tryPromise({
      try: async () => {
        const file = bucket.file(key);
        await file.delete({ ignoreNotFound: true });
      },
      catch: (error) => {
        return UploadistaError.fromCode("UNKNOWN_ERROR", { cause: error });
      },
    });

  const createResumableUpload = (context: GCSOperationContext) =>
    Effect.tryPromise({
      try: async () => {
        // For Node.js, we'll use a simplified approach
        // In production, you'd want to implement proper resumable uploads
        // Return a pseudo-URL that we can use to identify this upload
        return `resumable://nodejs/${context.bucket}/${context.key}`;
      },
      catch: (error) => {
        return UploadistaError.fromCode("FILE_WRITE_ERROR", { cause: error });
      },
    });

  const uploadChunk = (
    uploadUrl: string,
    chunk: Uint8Array,
    start: number,
    total?: number,
  ) =>
    Effect.tryPromise({
      try: async () => {
        // Extract key from pseudo-URL
        const key = uploadUrl.split("/").pop();
        if (!key) {
          throw new Error("Invalid upload URL");
        }

        const file = bucket.file(key);

        return new Promise<{ completed: boolean; bytesUploaded: number }>(
          (resolve, reject) => {
            const stream = file.createWriteStream({
              resumable: true,
              offset: start,
            });

            stream.on("error", reject);
            stream.on("finish", () => {
              resolve({
                completed: total ? start + chunk.length >= total : false,
                bytesUploaded: start + chunk.length,
              });
            });

            stream.end(Buffer.from(chunk));
          },
        );
      },
      catch: (error) => {
        return UploadistaError.fromCode("FILE_WRITE_ERROR", { cause: error });
      },
    });

  const getUploadStatus = (uploadUrl: string) =>
    Effect.promise(async () => {
      try {
        const key = uploadUrl.split("/").pop();
        if (!key) {
          throw new Error("Invalid upload URL");
        }

        const file = bucket.file(key);
        const [metadata] = await file.getMetadata();

        return {
          bytesUploaded: metadata.size
            ? Number.parseInt(`${metadata.size}`, 10)
            : 0,
          completed: true, // Simplified for now
        };
      } catch (_error) {
        // If file doesn't exist, upload hasn't started
        return { bytesUploaded: 0, completed: false };
      }
    });

  const cancelUpload = (uploadUrl: string) =>
    Effect.tryPromise({
      try: async () => {
        const key = uploadUrl.split("/").pop();
        if (!key) {
          throw new Error("Invalid upload URL");
        }

        const file = bucket.file(key);
        await file.delete({ ignoreNotFound: true });
      },
      catch: (error) => {
        return UploadistaError.fromCode("UNKNOWN_ERROR", { cause: error });
      },
    });

  const composeObjects = (
    sourceKeys: string[],
    destinationKey: string,
    context?: Partial<GCSOperationContext>,
  ) =>
    Effect.tryPromise({
      try: async () => {
        const sources = sourceKeys.map((key) => bucket.file(key));
        const destination = bucket.file(destinationKey);

        await bucket.combine(sources, destination);

        if (context?.metadata) {
          await destination.setMetadata({
            metadata: context.metadata,
          });
        }

        return destinationKey;
      },
      catch: (error) => {
        return UploadistaError.fromCode("FILE_WRITE_ERROR", { cause: error });
      },
    });

  const putObjectFromStreamWithPatching = (
    key: string,
    offset: number,
    readableStream: ReadableStream,
    context?: Partial<GCSOperationContext>,
    onProgress?: (chunkSize: number) => void, // Called with incremental bytes per chunk
    isAppend = false,
  ) =>
    Effect.gen(function* () {
      if (!isAppend) {
        // Direct upload for new files
        return yield* putObjectFromStream(
          key,
          offset,
          readableStream,
          context,
          onProgress,
        );
      }

      // For append operations, create a patch file and then combine
      const patchKey = `${key}_patch`;
      const bytesWritten = yield* putObjectFromStream(
        patchKey,
        offset,
        readableStream,
        context,
        onProgress,
      );

      // Combine original with patch
      yield* composeObjects([key, patchKey], key, context);

      // Clean up patch file
      yield* deleteObject(patchKey);

      return bytesWritten;
    });

  const putTemporaryObject = (
    key: string,
    body: Uint8Array,
    context?: Partial<GCSOperationContext>,
  ) => putObject(`${key}_tmp`, body, context);

  const getTemporaryObject = (key: string) =>
    Effect.gen(function* () {
      try {
        return yield* getObject(`${key}_tmp`);
      } catch {
        return undefined;
      }
    });

  const deleteTemporaryObject = (key: string) => deleteObject(`${key}_tmp`);

  const getObjectBuffer = (key: string) => {
    return Effect.tryPromise({
      try: async () => {
        const [buffer] = await bucket.file(key).download();
        return new Uint8Array(buffer);
      },
      catch: (error) => {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === 404
        ) {
          return UploadistaError.fromCode("FILE_NOT_FOUND");
        }
        return UploadistaError.fromCode("FILE_READ_ERROR", {
          cause: error,
        });
      },
    });
  };

  return {
    bucket: config.bucket,
    getObject,
    getObjectBuffer,
    getObjectMetadata,
    objectExists,
    putObject,
    putObjectFromStream,
    putObjectFromStreamWithPatching,
    deleteObject,
    createResumableUpload,
    uploadChunk,
    getUploadStatus,
    cancelUpload,
    composeObjects,
    putTemporaryObject,
    getTemporaryObject,
    deleteTemporaryObject,
  };
}

export const GCSClientNodeJSLayer = (config: GCSClientConfig) =>
  Layer.succeed(GCSClientService, createNodeJSGCSClient(config));
