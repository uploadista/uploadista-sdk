import type { DataStoreCapabilities } from "@uploadista/core/types";
import {
  type NegotiatedStrategy,
  UploadStrategyNegotiator,
  type UploadStrategyOptions,
} from "@uploadista/core/upload";
import { UploadistaError } from "../error";
import type { Logger } from "../logger";
import {
  defaultClientCapabilities,
  MockClientDataStore,
} from "../mock-data-store";
import type { HttpClient } from "../services/http-client";

export type UploadStrategyConfig = {
  preferredStrategy?: "single" | "parallel" | "auto";
  minFileSizeForParallel?: number;
  enableCapabilityNegotiation?: boolean;
  onStrategySelected?: (strategy: {
    chosen: "single" | "parallel";
    chunkSize: number;
    parallelUploads: number;
    reasoning: string[];
    warnings: string[];
  }) => void;
};

export type UploadClientOptions = {
  baseUrl: string;
  uploadBasePath?: string;
  storageId: string;
  retryDelays?: number[];
  chunkSize: number;
  parallelUploads?: number;
  parallelChunkSize?: number;
  uploadStrategy?: UploadStrategyConfig;
};

export function createUploadStrategyNegotiator(
  dataStore: MockClientDataStore,
): UploadStrategyNegotiator {
  return new UploadStrategyNegotiator(dataStore.getCapabilities(), (strategy) =>
    dataStore.validateUploadStrategy(strategy),
  );
}

/**
 * Fetch capabilities from server
 */
export async function fetchServerCapabilities(
  baseUrl: string,
  uploadBasePath: string,
  storageId: string,
  httpClient: HttpClient,
): Promise<DataStoreCapabilities> {
  const capabilitiesUrl = `${baseUrl}/${uploadBasePath}/capabilities?storageId=${encodeURIComponent(storageId)}`;

  try {
    const response = await httpClient.request(capabilitiesUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch capabilities: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    return (data as { capabilities: DataStoreCapabilities }).capabilities;
  } catch (_error) {
    // Fall back to default capabilities if server fetch fails
    return defaultClientCapabilities;
  }
}

/**
 * Negotiate upload strategy based on capabilities and options
 */
export function negotiateUploadStrategy({
  capabilities,
  fileSize,
  chunkSize,
  parallelUploads,
  uploadLengthDeferred,
  strategyConfig,
  logger,
}: {
  capabilities: DataStoreCapabilities;
  fileSize: number | null;
  chunkSize: number;
  parallelUploads: number;
  uploadLengthDeferred?: boolean;
  strategyConfig?: UploadStrategyConfig;
  logger: Logger;
}): NegotiatedStrategy {
  if (strategyConfig?.enableCapabilityNegotiation !== false) {
    // Use capability negotiation with server-fetched capabilities
    const mockDataStore = new MockClientDataStore(capabilities);
    const negotiator = createUploadStrategyNegotiator(mockDataStore);

    const negotiationOptions: UploadStrategyOptions = {
      fileSize: fileSize || 0,
      preferredStrategy:
        strategyConfig?.preferredStrategy === "auto"
          ? undefined
          : strategyConfig?.preferredStrategy,
      preferredChunkSize: chunkSize,
      parallelUploads,
      minChunkSizeForParallel:
        strategyConfig?.minFileSizeForParallel || 10 * 1024 * 1024,
    };

    const negotiatedStrategy = negotiator.negotiateStrategy(negotiationOptions);

    // Log negotiation results
    logger.log(`Upload strategy negotiated: ${negotiatedStrategy.strategy}`);
    for (const reason of negotiatedStrategy.reasoning) {
      logger.log(`  - ${reason}`);
    }
    for (const warning of negotiatedStrategy.warnings) {
      logger.log(`  Warning: ${warning}`);
    }

    // Notify client of strategy selection if callback provided
    strategyConfig?.onStrategySelected?.({
      chosen: negotiatedStrategy.strategy,
      chunkSize: negotiatedStrategy.chunkSize,
      parallelUploads: negotiatedStrategy.parallelUploads,
      reasoning: negotiatedStrategy.reasoning,
      warnings: negotiatedStrategy.warnings,
    });

    return negotiatedStrategy;
  } else {
    // Fallback to legacy logic
    const shouldUseParallelUpload =
      parallelUploads > 1 &&
      fileSize &&
      fileSize > (strategyConfig?.minFileSizeForParallel || 10 * 1024 * 1024) &&
      !uploadLengthDeferred;

    return {
      strategy: shouldUseParallelUpload ? "parallel" : "single",
      chunkSize,
      parallelUploads: shouldUseParallelUpload ? parallelUploads : 1,
      reasoning: [
        `Legacy strategy selection: ${shouldUseParallelUpload ? "parallel" : "single"}`,
      ],
      warnings: [],
    };
  }
}

/**
 * Validate upload client configuration against data store capabilities
 */
export function validateConfiguration(
  options: UploadClientOptions,
  capabilities: DataStoreCapabilities = defaultClientCapabilities,
  logger: Logger,
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate against capabilities
  const mockDataStore = new MockClientDataStore(capabilities);
  const negotiator = createUploadStrategyNegotiator(mockDataStore);

  const validation = negotiator.validateConfiguration({
    fileSize: 0, // Placeholder for validation
    preferredStrategy:
      options.uploadStrategy?.preferredStrategy === "auto"
        ? undefined
        : options.uploadStrategy?.preferredStrategy,
    preferredChunkSize: options.chunkSize,
    parallelUploads: options.parallelUploads,
  });

  if (!validation.valid) {
    errors.push(...validation.errors);
  }

  // Additional client-specific validations
  if (options.parallelUploads && options.parallelUploads < 1) {
    errors.push("parallelUploads must be at least 1");
  }

  if (options.chunkSize && options.chunkSize < 1024) {
    warnings.push("Chunk size below 1KB may impact performance");
  }

  if (
    options.uploadStrategy?.preferredStrategy === "parallel" &&
    !options.parallelUploads
  ) {
    warnings.push(
      "Parallel strategy requested but parallelUploads not configured",
    );
  }

  // Log validation results
  if (errors.length > 0) {
    logger.log("Configuration validation errors:");
    for (const error of errors) {
      logger.log(`  Error: ${error}`);
    }
  }

  if (warnings.length > 0) {
    logger.log("Configuration validation warnings:");
    for (const warning of warnings) {
      logger.log(`  Warning: ${warning}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Async configuration validation with server capabilities
 */
export async function validateConfigurationAsync(
  options: UploadClientOptions,
  httpClient: HttpClient,
  logger: Logger,
): Promise<{
  valid: boolean;
  errors: string[];
  warnings: string[];
  capabilities: DataStoreCapabilities;
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let capabilities: DataStoreCapabilities;
  try {
    capabilities = await fetchServerCapabilities(
      options.baseUrl,
      options.uploadBasePath || "api/upload",
      options.storageId,
      httpClient,
    );
  } catch (error) {
    logger.log(`Failed to fetch server capabilities for validation: ${error}`);
    capabilities = defaultClientCapabilities;
    warnings.push(
      "Using default capabilities for validation - server unavailable",
    );
  }

  const validation = validateConfiguration(options, capabilities, logger);
  errors.push(...validation.errors);
  warnings.push(...validation.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    capabilities,
  };
}

/**
 * Validate options and throw if invalid
 */
export function validateAndThrow(
  options: UploadClientOptions,
  logger: Logger,
): void {
  const validationResult = validateConfiguration(
    options,
    defaultClientCapabilities,
    logger,
  );

  if (!validationResult.valid) {
    const errorMessage = `Upload client configuration validation failed: ${validationResult.errors.join(", ")}`;
    logger.log(errorMessage);
    throw new UploadistaError({
      name: "UPLOAD_SIZE_NOT_SPECIFIED", // Reusing existing error type
      message: errorMessage,
    });
  }
}
