import type { R2Bucket, ReadableStream } from "@cloudflare/workers-types";
import type { UploadistaError } from "@uploadista/core/errors";
import { withS3ApiMetrics } from "@uploadista/observability";
import { Context, Effect, Layer } from "effect";
import type {
  MultipartUploadInfo,
  R2OperationContext,
  R2UploadedPart,
} from "../types";
import { handleR2Error, handleR2NotFoundError, partKey } from "../utils";

export class R2ClientService extends Context.Tag("R2ClientService")<
  R2ClientService,
  {
    readonly bucket: string;

    // Basic S3 operations
    readonly getObject: (
      key: string,
    ) => Effect.Effect<ReadableStream, UploadistaError>;
    readonly headObject: (
      key: string,
    ) => Effect.Effect<number | undefined, UploadistaError>;
    readonly putObject: (
      key: string,
      body: Uint8Array,
    ) => Effect.Effect<string, UploadistaError>;
    readonly deleteObject: (
      key: string,
    ) => Effect.Effect<void, UploadistaError>;
    readonly deleteObjects: (
      keys: string[],
    ) => Effect.Effect<void, UploadistaError>;

    // Multipart upload operations
    readonly createMultipartUpload: (
      context: R2OperationContext,
    ) => Effect.Effect<MultipartUploadInfo, UploadistaError>;
    readonly uploadPart: (
      context: R2OperationContext & { partNumber: number; data: Uint8Array },
    ) => Effect.Effect<string, UploadistaError>;
    readonly completeMultipartUpload: (
      context: R2OperationContext,
      parts: Array<R2UploadedPart>,
    ) => Effect.Effect<string | undefined, UploadistaError>;
    readonly abortMultipartUpload: (
      context: R2OperationContext,
    ) => Effect.Effect<void, UploadistaError>;

    // Incomplete part operations
    readonly getIncompletePart: (
      id: string,
    ) => Effect.Effect<ReadableStream | undefined, UploadistaError>;
    readonly getIncompletePartSize: (
      id: string,
    ) => Effect.Effect<number | undefined, UploadistaError>;
    readonly putIncompletePart: (
      id: string,
      data: Uint8Array,
    ) => Effect.Effect<string, UploadistaError>;
    readonly deleteIncompletePart: (
      id: string,
    ) => Effect.Effect<void, UploadistaError>;
  }
>() {}

export const makeR2ClientService = (
  r2Bucket: R2Bucket,
  r2BucketName: string,
) => {
  const getObject = (key: string) =>
    Effect.gen(function* () {
      const data = yield* Effect.tryPromise({
        try: async () => {
          const result = await r2Bucket.get(key);
          if (!result) {
            throw new Error(`Object not found: ${key}`);
          }
          return result.body;
        },
        catch: (error) =>
          handleR2Error("getObject", error, { key, bucket: r2BucketName }),
      });
      return data;
    });

  const headObject = (key: string) =>
    Effect.tryPromise({
      try: async () => {
        const data = await r2Bucket.head(key);
        if (!data) {
          return undefined;
        }
        return data.size;
      },
      catch: (error) =>
        handleR2Error("headObject", error, { key, bucket: r2BucketName }),
    });

  const putObject = (key: string, body: Uint8Array) =>
    Effect.tryPromise({
      try: async () => {
        const response = await r2Bucket.put(key, body);
        if (!response) {
          throw new Error("Failed to put object");
        }
        return response.etag;
      },
      catch: (error) =>
        handleR2Error("putObject", error, {
          key,
          bucket: r2BucketName,
          size: body.length,
        }),
    });

  const deleteObject = (key: string) =>
    Effect.tryPromise({
      try: async () => {
        await r2Bucket.delete(key);
      },
      catch: (error) =>
        handleR2Error("deleteObject", error, { key, bucket: r2BucketName }),
    });

  const deleteObjects = (keys: string[]) =>
    Effect.tryPromise({
      try: () => r2Bucket.delete(keys),
      catch: (error) =>
        handleR2Error("deleteObjects", error, {
          keys: keys.length,
          bucket: r2BucketName,
        }),
    });

  const createMultipartUpload = (context: R2OperationContext) =>
    withS3ApiMetrics(
      "createMultipartUpload",
      Effect.tryPromise({
        try: async () => {
          const multipartUpload = await r2Bucket.createMultipartUpload(
            context.key,
          );

          if (!multipartUpload.uploadId) {
            throw new Error("Upload ID is undefined");
          }
          if (!multipartUpload.key) {
            throw new Error("Key is undefined");
          }

          return {
            uploadId: multipartUpload.uploadId,
            bucket: context.bucket,
            key: multipartUpload.key,
          };
        },
        catch: (error) =>
          handleR2Error("createMultipartUpload", error, context),
      }),
    );

  const uploadPart = (
    context: R2OperationContext & { partNumber: number; data: Uint8Array },
  ) =>
    withS3ApiMetrics(
      "uploadPart",
      Effect.tryPromise({
        try: async () => {
          const multipartUpload = await r2Bucket.resumeMultipartUpload(
            context.key,
            context.uploadId,
          );
          const part = await multipartUpload.uploadPart(
            context.partNumber,
            context.data,
          );
          if (!part) {
            throw new Error("Part is undefined");
          }
          return part.etag;
        },
        catch: (error) =>
          handleR2Error("uploadPart", error, {
            upload_id: context.key,
            part_number: context.partNumber,
            part_size: context.data.length,
            s3_bucket: context.bucket,
          }),
      }).pipe(Effect.map((response) => response)),
    );

  const completeMultipartUpload = (
    context: R2OperationContext,
    parts: Array<R2UploadedPart>,
  ) =>
    withS3ApiMetrics(
      "completeMultipartUpload",
      Effect.tryPromise({
        try: async () => {
          const multipartUpload = await r2Bucket.resumeMultipartUpload(
            context.key,
            context.uploadId,
          );
          const complete = await multipartUpload.complete(parts);
          if (!complete) {
            throw new Error("Complete is undefined");
          }
          return complete.key;
        },
        catch: (error) =>
          handleR2Error("completeMultipartUpload", error, {
            upload_id: context.key,
            parts_count: parts.length,
            s3_bucket: context.bucket,
          }),
      }),
    );

  const abortMultipartUpload = (context: R2OperationContext) =>
    Effect.tryPromise({
      try: async () => {
        const multipartUpload = await r2Bucket.resumeMultipartUpload(
          context.key,
          context.uploadId,
        );
        await multipartUpload.abort();
      },
      catch: (error) =>
        handleR2NotFoundError("abortMultipartUpload", error, {
          upload_id: context.key,
          s3_bucket: context.bucket,
        }),
    });

  // Note: R2 does not provide a listParts API like S3
  // Parts are tracked in the KV store instead (see r2-store.ts)
  // Note: R2 also does not provide listMultipartUploads API
  // For cleanup, use R2's native expiration policies instead

  const getIncompletePart = (id: string) =>
    Effect.tryPromise({
      try: async () => {
        const data = await r2Bucket.get(partKey(id));
        if (!data || !data.body) {
          return undefined;
        }
        return data.body;
      },
      catch: (error) =>
        handleR2Error("getIncompletePart", error, {
          upload_id: id,
          bucket: r2BucketName,
        }),
    });

  const getIncompletePartSize = (id: string) => headObject(partKey(id));

  const putIncompletePart = (id: string, data: Uint8Array) =>
    putObject(partKey(id), data).pipe(
      Effect.tap(() =>
        Effect.logInfo("Incomplete part uploaded").pipe(
          Effect.annotateLogs({ upload_id: id }),
        ),
      ),
    );

  const deleteIncompletePart = (id: string) => deleteObject(partKey(id));

  return {
    bucket: r2BucketName,
    getObject,
    headObject,
    putObject,
    deleteObject,
    deleteObjects,
    createMultipartUpload,
    uploadPart,
    completeMultipartUpload,
    abortMultipartUpload,
    getIncompletePart,
    getIncompletePartSize,
    putIncompletePart,
    deleteIncompletePart,
  };
};

export const R2ClientLayer = (r2Bucket: R2Bucket, r2BucketName: string) =>
  Layer.succeed(R2ClientService, makeR2ClientService(r2Bucket, r2BucketName));
