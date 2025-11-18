import { z } from "zod";

export const extractTextParamsSchema = z.object({});

export type ExtractTextParams = z.infer<typeof extractTextParamsSchema>;
