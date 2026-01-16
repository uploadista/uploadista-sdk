import type { JsonValue } from "@uploadista/core/types";
import z from "zod";

/**
 * JSON value schema that allows any JSON-serializable data.
 * This is used for metadata values which can be primitives, arrays, or objects.
 */
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export type PreviousUpload = {
  size: number | null;
  metadata: Record<string, JsonValue>;
  creationTime: string;
  uploadId?: string;
  parallelUploadUrls?: string[];
  clientStorageKey: string;
};

export const previousUploadSchema = z.object({
  size: z.number().nullable(),
  metadata: z.record(z.string(), jsonValueSchema),
  creationTime: z.string(),
  uploadId: z.string().optional(),
  parallelUploadUrls: z.array(z.string()).optional(),
  clientStorageKey: z.string(),
});
