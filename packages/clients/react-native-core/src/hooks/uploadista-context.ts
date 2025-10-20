import type { UploadistaEvent } from "@uploadista/client-core";
import { createContext } from "react";
import type { FileSystemProvider } from "../types";
import type { UseUploadistaClientReturn } from "./use-uploadista-client";

export interface UploadistaContextType extends UseUploadistaClientReturn {
  fileSystemProvider: FileSystemProvider;
  /**
   * Subscribe to events (used internally by hooks)
   * @internal
   */
  subscribeToEvents: (handler: (event: UploadistaEvent) => void) => () => void;
}

export const UploadistaContext = createContext<
  UploadistaContextType | undefined
>(undefined);
