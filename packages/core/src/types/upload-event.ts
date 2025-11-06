import { z } from "zod";
import { uploadFileSchema } from "./upload-file";

export enum UploadEventType {
  UPLOAD_STARTED = "upload-started",
  UPLOAD_PROGRESS = "upload-progress",
  UPLOAD_COMPLETE = "upload-complete",
  UPLOAD_FAILED = "upload-failed",
  UPLOAD_VALIDATION_SUCCESS = "upload-validation-success",
  UPLOAD_VALIDATION_FAILED = "upload-validation-failed",
  UPLOAD_VALIDATION_WARNING = "upload-validation-warning",
}

const flowContextSchema = z
  .object({
    flowId: z.string(),
    nodeId: z.string(),
    jobId: z.string(),
  })
  .optional();

export const uploadEventSchema = z.union([
  z.object({
    type: z.union([
      z.literal(UploadEventType.UPLOAD_STARTED),
      z.literal(UploadEventType.UPLOAD_COMPLETE),
    ]),
    data: uploadFileSchema,
    flow: flowContextSchema,
  }),
  z.object({
    type: z.literal(UploadEventType.UPLOAD_PROGRESS),
    data: z.object({
      id: z.string(),
      progress: z.number(),
      total: z.number(),
    }),
    flow: flowContextSchema,
  }),
  z.object({
    type: z.literal(UploadEventType.UPLOAD_FAILED),
    data: z.object({
      id: z.string(),
      error: z.string(),
    }),
    flow: flowContextSchema,
  }),
  z.object({
    type: z.literal(UploadEventType.UPLOAD_VALIDATION_SUCCESS),
    data: z.object({
      id: z.string(),
      validationType: z.enum(["checksum", "mimetype"]),
      algorithm: z.string().optional(),
    }),
    flow: flowContextSchema,
  }),
  z.object({
    type: z.literal(UploadEventType.UPLOAD_VALIDATION_FAILED),
    data: z.object({
      id: z.string(),
      reason: z.string(),
      expected: z.string(),
      actual: z.string(),
    }),
    flow: flowContextSchema,
  }),
  z.object({
    type: z.literal(UploadEventType.UPLOAD_VALIDATION_WARNING),
    data: z.object({
      id: z.string(),
      message: z.string(),
    }),
    flow: flowContextSchema,
  }),
]);

export type UploadEvent = z.infer<typeof uploadEventSchema>;
