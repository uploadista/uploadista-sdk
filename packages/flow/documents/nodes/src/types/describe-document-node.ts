import { z } from "zod";

export const describeDocumentParamsSchema = z.object({});

export type DescribeDocumentParams = z.infer<
  typeof describeDocumentParamsSchema
>;
