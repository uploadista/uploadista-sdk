import type { AbortControllerFactory } from "./abort-controller-service";
import type { ChecksumService } from "./checksum-service";
import type { Base64Service, FileReaderService } from "./file-reader-service";
import type { FingerprintService } from "./fingerprint-service";
import type { HttpClient } from "./http-client";
import type { IdGenerationService } from "./id-generation-service";
import type { PlatformService } from "./platform-service";
import type { StorageService } from "./storage-service";
import type { WebSocketFactory } from "./websocket-service";
/**
 * Service container for dependency injection
 */
export interface ServiceContainer<UploadInput> {
  storage: StorageService;
  idGeneration: IdGenerationService;
  httpClient: HttpClient;
  fileReader: FileReaderService<UploadInput>;
  base64?: Base64Service;
  websocket: WebSocketFactory;
  abortController: AbortControllerFactory;
  platform: PlatformService;
  checksumService: ChecksumService;
  fingerprintService: FingerprintService<UploadInput>;
}
