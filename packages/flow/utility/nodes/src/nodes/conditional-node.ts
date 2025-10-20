import {
  completeNodeExecution,
  createFlowNode,
  NodeType,
} from "@uploadista/core/flow";
import { type UploadFile, uploadFileSchema } from "@uploadista/core/types";
import { Effect } from "effect";
import type { ConditionalParams } from "@/types/conditional-node";

export function createConditionalNode(
  id: string,
  { field, operator, value }: ConditionalParams,
) {
  return createFlowNode<UploadFile, UploadFile>({
    id,
    name: "Conditional Router",
    description: `Routes flow based on ${field} ${operator} ${value}`,
    type: NodeType.conditional,
    inputSchema: uploadFileSchema,
    outputSchema: uploadFileSchema,
    condition: { field, operator, value },
    run: ({ data }) => {
      // The actual routing logic is handled by the flow engine
      // This node just passes through the data
      return Effect.succeed(completeNodeExecution(data));
    },
  });
}
