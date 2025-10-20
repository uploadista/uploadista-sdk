import z from "zod";

export type PreviousUpload = {
  size: number | null;
  metadata: { [key: string]: string | number | boolean };
  creationTime: string;
  uploadId?: string;
  parallelUploadUrls?: string[];
  clientStorageKey: string;
};

export const previousUploadSchema = z.object({
  size: z.number().nullable(),
  metadata: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()]),
  ),
  creationTime: z.string(),
  uploadId: z.string().optional(),
  parallelUploadUrls: z.array(z.string()).optional(),
  clientStorageKey: z.string(),
});
