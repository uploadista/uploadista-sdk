import type { DurableObjectNamespace, Rpc } from "@cloudflare/workers-types";
import type { UploadEventType, UploadFile } from "@uploadista/core/types";

export type UploadFileDurableObjectBranded<T extends UploadFile> =
  Rpc.DurableObjectBranded & {
    getUploadFile: () => Promise<T | undefined>;
    setUploadFile: (value: T) => Promise<void>;
    deleteUploadFile: () => Promise<void>;
    emit: (event: UploadEventType) => Promise<void>;
  };

// Durable Object
export type UploadFileDurableObject<T extends UploadFile> =
  DurableObjectNamespace<UploadFileDurableObjectBranded<T>>;
