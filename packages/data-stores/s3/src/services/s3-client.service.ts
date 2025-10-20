import type AWS from "@aws-sdk/client-s3";
import type { S3ClientConfig } from "@aws-sdk/client-s3";
import { NoSuchKey, NotFound, S3 } from "@aws-sdk/client-s3";
import type { UploadistaError } from "@uploadista/core/errors";
import { withS3ApiMetrics } from "@uploadista/observability";
import { Context, Effect, Layer } from "effect";
import type { MultipartUploadInfo, S3OperationContext } from "../types";
import {
  handleS3Error,
  handleS3NotFoundError,
  partKey,
  toReadableStream,
} from "../utils";

export class S3ClientService extends Context.Tag("S3ClientService")<
  S3ClientService,
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
    ) => Effect.Effect<AWS.DeleteObjectsCommandOutput, UploadistaError>;

    // Multipart upload operations
    readonly createMultipartUpload: (
      context: S3OperationContext,
    ) => Effect.Effect<MultipartUploadInfo, UploadistaError>;
    readonly uploadPart: (
      context: S3OperationContext & { partNumber: number; data: Uint8Array },
    ) => Effect.Effect<string, UploadistaError>;
    readonly completeMultipartUpload: (
      context: S3OperationContext,
      parts: Array<AWS.Part>,
    ) => Effect.Effect<string | undefined, UploadistaError>;
    readonly abortMultipartUpload: (
      context: S3OperationContext,
    ) => Effect.Effect<void, UploadistaError>;
    readonly listParts: (
      context: S3OperationContext & { partNumberMarker?: string },
    ) => Effect.Effect<
      {
        parts: AWS.Part[];
        isTruncated: boolean;
        nextPartNumberMarker?: string;
      },
      UploadistaError
    >;
    readonly listMultipartUploads: (
      keyMarker?: string,
      uploadIdMarker?: string,
    ) => Effect.Effect<AWS.ListMultipartUploadsCommandOutput, UploadistaError>;

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

export const makeS3ClientService = (
  s3ClientConfig: S3ClientConfig,
  bucket: string,
) => {
  const s3Client = new S3(s3ClientConfig);
  const getObject = (key: string) =>
    Effect.tryPromise({
      try: async () => {
        const data = await s3Client.getObject({
          Bucket: bucket,
          Key: key,
        });
        return toReadableStream(data.Body);
      },
      catch: (error) => handleS3Error("getObject", error, { key, bucket }),
    });

  const headObject = (key: string) =>
    Effect.tryPromise({
      try: async () => {
        try {
          const data = await s3Client.headObject({
            Bucket: bucket,
            Key: key,
          });
          return data.ContentLength;
        } catch (error) {
          if (error instanceof NotFound) {
            return undefined;
          }
          throw error;
        }
      },
      catch: (error) => handleS3Error("headObject", error, { key, bucket }),
    });

  const putObject = (key: string, body: Uint8Array) =>
    Effect.tryPromise({
      try: async () => {
        const response = await s3Client.putObject({
          Bucket: bucket,
          Key: key,
          Body: body,
        });
        return response.ETag || "";
      },
      catch: (error) =>
        handleS3Error("putObject", error, { key, bucket, size: body.length }),
    });

  const deleteObject = (key: string) =>
    Effect.tryPromise({
      try: async () => {
        await s3Client.deleteObject({
          Bucket: bucket,
          Key: key,
        });
      },
      catch: (error) => handleS3Error("deleteObject", error, { key, bucket }),
    });

  const deleteObjects = (keys: string[]) =>
    Effect.tryPromise({
      try: () =>
        s3Client.deleteObjects({
          Bucket: bucket,
          Delete: {
            Objects: keys.map((key) => ({ Key: key })),
          },
        }),
      catch: (error) =>
        handleS3Error("deleteObjects", error, { keys: keys.length, bucket }),
    });

  const createMultipartUpload = (context: S3OperationContext) =>
    withS3ApiMetrics(
      "createMultipartUpload",
      Effect.tryPromise({
        try: async () => {
          const request: AWS.CreateMultipartUploadCommandInput = {
            Bucket: context.bucket,
            Key: context.key,
          };

          if (context.contentType) {
            request.ContentType = context.contentType;
          }

          if (context.cacheControl) {
            request.CacheControl = context.cacheControl;
          }

          const res = await s3Client.createMultipartUpload(request);

          if (!res.UploadId) {
            throw new Error("Upload ID is undefined");
          }
          if (!res.Key) {
            throw new Error("Key is undefined");
          }

          return {
            uploadId: res.UploadId,
            bucket: context.bucket,
            key: res.Key,
          };
        },
        catch: (error) =>
          handleS3Error("createMultipartUpload", error, context),
      }),
    );

  const uploadPart = (
    context: S3OperationContext & { partNumber: number; data: Uint8Array },
  ) =>
    withS3ApiMetrics(
      "uploadPart",
      Effect.tryPromise({
        try: () =>
          s3Client.uploadPart({
            Bucket: context.bucket,
            Key: context.key,
            UploadId: context.uploadId,
            PartNumber: context.partNumber,
            Body: context.data,
          }),
        catch: (error) =>
          handleS3Error("uploadPart", error, {
            upload_id: context.key,
            part_number: context.partNumber,
            part_size: context.data.length,
            s3_bucket: context.bucket,
          }),
      }).pipe(Effect.map((response) => response.ETag as string)),
    );

  const completeMultipartUpload = (
    context: S3OperationContext,
    parts: Array<AWS.Part>,
  ) =>
    withS3ApiMetrics(
      "completeMultipartUpload",
      Effect.tryPromise({
        try: () =>
          s3Client
            .completeMultipartUpload({
              Bucket: context.bucket,
              Key: context.key,
              UploadId: context.uploadId,
              MultipartUpload: {
                Parts: parts.map((part) => ({
                  ETag: part.ETag,
                  PartNumber: part.PartNumber,
                })),
              },
            })
            .then((response) => response.Location),
        catch: (error) =>
          handleS3Error("completeMultipartUpload", error, {
            upload_id: context.key,
            parts_count: parts.length,
            s3_bucket: context.bucket,
          }),
      }),
    );

  const abortMultipartUpload = (context: S3OperationContext) =>
    Effect.tryPromise({
      try: async () => {
        await s3Client.abortMultipartUpload({
          Bucket: context.bucket,
          Key: context.key,
          UploadId: context.uploadId,
        });
      },
      catch: (error) =>
        handleS3NotFoundError("abortMultipartUpload", error, {
          upload_id: context.key,
          s3_bucket: context.bucket,
        }),
    });

  const listParts = (
    context: S3OperationContext & { partNumberMarker?: string },
  ) =>
    Effect.tryPromise({
      try: async () => {
        const params: AWS.ListPartsCommandInput = {
          Bucket: context.bucket,
          Key: context.key,
          UploadId: context.uploadId,
          PartNumberMarker: context.partNumberMarker,
        };

        const data = await s3Client.listParts(params);

        return {
          parts: data.Parts ?? [],
          isTruncated: data.IsTruncated ?? false,
          nextPartNumberMarker: data.NextPartNumberMarker,
        };
      },
      catch: (error) =>
        handleS3Error("listParts", error, {
          upload_id: context.key,
          s3_bucket: context.bucket,
        }),
    });

  const listMultipartUploads = (keyMarker?: string, uploadIdMarker?: string) =>
    Effect.tryPromise({
      try: () =>
        s3Client.listMultipartUploads({
          Bucket: bucket,
          KeyMarker: keyMarker,
          UploadIdMarker: uploadIdMarker,
        }),
      catch: (error) =>
        handleS3Error("listMultipartUploads", error, { bucket }),
    });

  const getIncompletePart = (id: string) =>
    Effect.tryPromise({
      try: async () => {
        try {
          const data = await s3Client.getObject({
            Bucket: bucket,
            Key: partKey(id),
          });
          return toReadableStream(data.Body);
        } catch (error) {
          if (error instanceof NoSuchKey) {
            return undefined;
          }
          throw error;
        }
      },
      catch: (error) =>
        handleS3Error("getIncompletePart", error, { upload_id: id, bucket }),
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
    bucket,
    getObject,
    headObject,
    putObject,
    deleteObject,
    deleteObjects,
    createMultipartUpload,
    uploadPart,
    completeMultipartUpload,
    abortMultipartUpload,
    listParts,
    listMultipartUploads,
    getIncompletePart,
    getIncompletePartSize,
    putIncompletePart,
    deleteIncompletePart,
  };
};

export const S3ClientLayer = (s3ClientConfig: S3ClientConfig, bucket: string) =>
  Layer.succeed(S3ClientService, makeS3ClientService(s3ClientConfig, bucket));
