import { z } from "zod";

export const uploadFileSchema = z.object({
  id: z.string(),
  size: z.number().optional(),
  offset: z.number(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  creationDate: z.string().optional(),
  url: z.string().optional(),
  sizeIsDeferred: z.boolean().optional(),
  checksum: z.string().optional(),
  checksumAlgorithm: z.string().optional(),
  storage: z.object({
    id: z.string(),
    type: z.string(),
    path: z.string().optional(),
    uploadId: z.string().optional(),
    bucket: z.string().optional(),
  }),
  flow: z
    .object({
      flowId: z.string(),
      nodeId: z.string(),
      jobId: z.string(),
    })
    .optional(),
});

export type UploadFile = {
  id: string;
  offset: number;
  storage: {
    id: string;
    type: string;
    path?: string | undefined;
    uploadId?: string | undefined;
    bucket?: string | undefined;
  };
  flow?: {
    flowId: string;
    nodeId: string;
    jobId: string;
  };
  size?: number | undefined;
  metadata?: Record<string, string | number | boolean> | undefined;
  creationDate?: string | undefined;
  url?: string | undefined;
  sizeIsDeferred?: boolean | undefined;
  checksum?: string | undefined;
  checksumAlgorithm?: string | undefined;
};
