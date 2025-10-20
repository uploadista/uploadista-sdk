import {
  type ConnectionPoolConfig,
  createClientStorage,
  createLogger,
  createUploadistaClient as createUploadistaClientCore,
  type UploadistaClientOptions as UploadistaClientOptionsCore,
} from "@uploadista/client-core";
import { createBrowserServices } from "../services/create-browser-services";
import type { BrowserUploadInput } from "../types/upload-input";

export interface UploadistaClientOptions
  extends Omit<
    UploadistaClientOptionsCore<BrowserUploadInput>,
    | "webSocketFactory"
    | "abortControllerFactory"
    | "generateId"
    | "clientStorage"
    | "logger"
    | "platformService"
    | "fingerprintService"
    | "httpClient"
    | "fileReader"
    | "checksumService"
  > {
  connectionPooling?: ConnectionPoolConfig;
}

export function createUploadistaClient(options: UploadistaClientOptions) {
  const services = createBrowserServices({
    connectionPooling: options.connectionPooling,
  });

  return createUploadistaClientCore<BrowserUploadInput>({
    ...options,
    webSocketFactory: services.websocket,
    abortControllerFactory: services.abortController,
    platformService: services.platform,
    httpClient: services.httpClient,
    fileReader: services.fileReader,
    generateId: services.idGeneration,
    fingerprintService: services.fingerprintService,
    checksumService: services.checksumService,
    logger: createLogger(false, () => {}),
    clientStorage: createClientStorage(services.storage),
  });
}
