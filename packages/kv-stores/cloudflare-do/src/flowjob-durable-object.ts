import type { DurableObjectNamespace, Rpc } from "@cloudflare/workers-types";
import type { FlowEvent, FlowJob } from "@uploadista/core/flow";

export type FlowJobDurableObjectBranded<T extends FlowJob> =
  Rpc.DurableObjectBranded & {
    getFlowJob: () => Promise<T | undefined>;
    setFlowJob: (value: T) => Promise<void>;
    deleteFlowJob: () => Promise<void>;
    emit: (event: FlowEvent) => Promise<void>;
  };

// Durable Object
export type FlowJobDurableObject<T extends FlowJob> = DurableObjectNamespace<
  FlowJobDurableObjectBranded<T>
>;
