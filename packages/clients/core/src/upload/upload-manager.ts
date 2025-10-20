import type { UploadistaApi } from "../client/uploadista-api";
import { UploadistaError } from "../error";
import type { AbortControllerLike } from "../services/abort-controller-service";
import {
  type PlatformService,
  type Timeout,
  wait,
} from "../services/platform-service";
import type { ClientStorage } from "../storage/client-storage";
import { shouldRetry } from "./chunk-upload";
import { removeFromClientStorage } from "./upload-storage";

/**
 * Use the Termination extension to delete an upload from the server by sending a DELETE
 * request to the specified upload URL. This is only possible if the server supports the
 * Termination extension. If the `retryDelays` property is set, the method will
 * also retry if an error occurs.
 */
export async function terminate(
  uploadId: string,
  uploadistaApi: UploadistaApi,
  platformService: PlatformService,
  retryDelays: number[] | undefined,
  retryAttempt = 0,
): Promise<void> {
  try {
    const res = await uploadistaApi.deleteUpload(uploadId);
    // A 204 response indicates a successful request
    if (res.status === 204) {
      return;
    }

    throw new UploadistaError({
      name: "NETWORK_UNEXPECTED_RESPONSE",
      message: "Unexpected response while terminating upload",
    });
  } catch (err) {
    const error = err as UploadistaError;

    if (!shouldRetry(platformService, error, retryAttempt, retryDelays)) {
      throw err;
    }

    // Instead of keeping track of the retry attempts, we remove the first element from the delays
    // array. If the array is empty, all retry attempts are used up and we will bubble up the error.
    // We recursively call the terminate function will removing elements from the retryDelays array.
    const delay = retryDelays?.[retryAttempt] ?? 0;

    await wait(platformService, delay);

    return await terminate(
      uploadId,
      uploadistaApi,
      platformService,
      retryDelays,
      retryAttempt + 1,
    );
  }
}

/**
 * Abort any running request and stop the current upload. After abort is called, no event
 * handler will be invoked anymore. You can use the `start` method to resume the upload
 * again.
 * If `shouldTerminate` is true, the `terminate` function will be called to remove the
 * current upload from the server.
 */
export async function abort({
  uploadId,
  uploadIdStorageKey,
  retryTimeout,
  shouldTerminate,
  abortController,
  uploadistaApi,
  platformService,
  retryDelays,
  clientStorage,
}: {
  uploadId: string;
  uploadIdStorageKey: string | undefined;
  retryTimeout: Timeout | null;
  shouldTerminate: boolean;
  abortController: AbortControllerLike;
  uploadistaApi: UploadistaApi;
  platformService: PlatformService;
  retryDelays?: number[];
  clientStorage: ClientStorage;
}): Promise<void> {
  // Stop any current running request.
  abortController.abort();

  // Stop any timeout used for initiating a retry.
  if (retryTimeout != null) {
    platformService.clearTimeout(retryTimeout);
  }

  if (!shouldTerminate || uploadId == null) {
    return;
  }

  await terminate(uploadId, uploadistaApi, platformService, retryDelays);

  if (uploadIdStorageKey != null) {
    return removeFromClientStorage(clientStorage, uploadIdStorageKey);
  }
}
