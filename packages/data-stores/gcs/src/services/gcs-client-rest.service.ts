import { UploadistaError } from "@uploadista/core/errors";
import { Effect, Layer } from "effect";
import {
  type GCSClientConfig,
  GCSClientService,
  type GCSObjectMetadata,
  type GCSOperationContext,
} from "./gcs-client.service";

function createRESTGCSClient(config: GCSClientConfig) {
  if (!config.accessToken) {
    throw new Error("accessToken is required for REST API implementation");
  }

  const baseUrl = `https://storage.googleapis.com/storage/v1/b/${config.bucket}`;
  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${config.bucket}/o`;
  const accessToken = config.accessToken;

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  });

  const getObject = (key: string) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(
          `${baseUrl}/o/${encodeURIComponent(key)}?alt=media`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("File not found");
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        if (!response.body) {
          throw new Error("body not found");
        }

        return response.body;
      },
      catch: (error) => {
        if (error instanceof Error && error.message.includes("not found")) {
          return UploadistaError.fromCode("FILE_NOT_FOUND");
        }
        return UploadistaError.fromCode("UNKNOWN_ERROR", { cause: error });
      },
    });

  const getObjectMetadata = (key: string) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(
          `${baseUrl}/o/${encodeURIComponent(key)}`,
          {
            headers: getAuthHeaders(),
          },
        );

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("File not found");
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as {
          name: string;
          bucket: string;
          size?: string;
          contentType?: string;
          metadata?: Record<string, string>;
          generation?: string;
          timeCreated?: string;
          updated?: string;
        };

        return {
          name: data.name,
          bucket: data.bucket,
          size: data.size ? Number.parseInt(data.size, 10) : undefined,
          contentType: data.contentType,
          metadata: data.metadata || {},
          generation: data.generation,
          timeCreated: data.timeCreated,
          updated: data.updated,
        } as GCSObjectMetadata;
      },
      catch: (error) => {
        if (error instanceof Error && error.message.includes("not found")) {
          return UploadistaError.fromCode("FILE_NOT_FOUND");
        }
        return UploadistaError.fromCode("UNKNOWN_ERROR", { cause: error });
      },
    });

  const objectExists = (key: string) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(
          `${baseUrl}/o/${encodeURIComponent(key)}`,
          {
            method: "HEAD",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        return response.ok;
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
        const metadata = {
          name: key,
          contentType: context?.contentType || "application/octet-stream",
          metadata: context?.metadata || {},
        };

        const response = await fetch(
          `${uploadUrl}?uploadType=media&name=${encodeURIComponent(key)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": metadata.contentType,
              "Content-Length": body.length.toString(),
            },
            body: body,
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return key;
      },
      catch: (error) => {
        return UploadistaError.fromCode("FILE_WRITE_ERROR", { cause: error });
      },
    });

  const deleteObject = (key: string) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(
          `${baseUrl}/o/${encodeURIComponent(key)}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        // 404 is OK - object didn't exist
        if (!response.ok && response.status !== 404) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      },
      catch: (error) => {
        return UploadistaError.fromCode("UNKNOWN_ERROR", { cause: error });
      },
    });

  const createResumableUpload = (context: GCSOperationContext) =>
    Effect.tryPromise({
      try: async () => {
        const metadata = {
          name: context.key,
          contentType: context.contentType || "application/octet-stream",
          metadata: context.metadata || {},
        };

        const response = await fetch(
          `${uploadUrl}?uploadType=resumable&name=${encodeURIComponent(context.key)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(metadata),
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const resumableUploadUrl = response.headers.get("Location");
        if (!resumableUploadUrl) {
          throw new Error("No upload URL returned");
        }

        return resumableUploadUrl;
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
        const end = start + chunk.length - 1;
        const contentRange = total
          ? `bytes ${start}-${end}/${total}`
          : `bytes ${start}-${end}/*`;

        const response = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Length": chunk.length.toString(),
            "Content-Range": contentRange,
          },
          body: chunk,
        });

        // 308 means more data needed, 200/201 means complete
        const completed = response.status === 200 || response.status === 201;

        if (!completed && response.status !== 308) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return {
          completed,
          bytesUploaded: end + 1,
        };
      },
      catch: (error) => {
        return UploadistaError.fromCode("FILE_WRITE_ERROR", { cause: error });
      },
    });

  const getUploadStatus = (uploadUrl: string) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Range": "bytes */*",
          },
        });

        if (response.status === 308) {
          // Upload incomplete
          const range = response.headers.get("Range");
          const bytesUploaded = range
            ? Number.parseInt(range.split("-")[1], 10) + 1
            : 0;

          return {
            bytesUploaded,
            completed: false,
          };
        } else if (response.status === 200 || response.status === 201) {
          // Upload complete
          return {
            bytesUploaded: 0, // We don't know the exact size
            completed: true,
          };
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      },
      catch: (error) => {
        return UploadistaError.fromCode("UNKNOWN_ERROR", { cause: error });
      },
    });

  const cancelUpload = (uploadUrl: string) =>
    Effect.tryPromise({
      try: async () => {
        // Cancel by sending DELETE to upload URL
        await fetch(uploadUrl, {
          method: "DELETE",
        });
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
        const composeRequest = {
          kind: "storage#composeRequest",
          sourceObjects: sourceKeys.map((key) => ({ name: key })),
          destination: {
            name: destinationKey,
            contentType: context?.contentType || "application/octet-stream",
            metadata: context?.metadata || {},
          },
        };

        const response = await fetch(
          `${baseUrl}/o/${encodeURIComponent(destinationKey)}/compose`,
          {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify(composeRequest),
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return destinationKey;
      },
      catch: (error) => {
        return UploadistaError.fromCode("FILE_WRITE_ERROR", { cause: error });
      },
    });

  const putTemporaryObject = (
    key: string,
    body: Uint8Array,
    context?: Partial<GCSOperationContext>,
  ) => putObject(`${key}_tmp`, body, context);

  const getTemporaryObject = (key: string) =>
    Effect.tryPromise({
      try: async () => {
        try {
          return await getObject(`${key}_tmp`).pipe(Effect.runPromise);
        } catch {
          return undefined;
        }
      },
      catch: () => {
        return UploadistaError.fromCode("UNKNOWN_ERROR");
      },
    });

  const deleteTemporaryObject = (key: string) => deleteObject(`${key}_tmp`);

  const getObjectBuffer = (key: string) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(
          `${baseUrl}/o/${encodeURIComponent(key)}?alt=media`,
          {
            headers: getAuthHeaders(),
          },
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return new Uint8Array(await response.arrayBuffer());
      },
      catch: (error) => {
        return UploadistaError.fromCode("FILE_READ_ERROR", { cause: error });
      },
    });

  return {
    bucket: config.bucket,
    getObject,
    getObjectBuffer,
    getObjectMetadata,
    objectExists,
    putObject,
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

export const GCSClientRESTLayer = (config: GCSClientConfig) =>
  Layer.succeed(GCSClientService, createRESTGCSClient(config));
