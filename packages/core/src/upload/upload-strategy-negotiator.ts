import type { DataStoreCapabilities, UploadStrategy } from "../types";

export type UploadStrategyOptions = {
  fileSize: number;
  preferredStrategy?: UploadStrategy;
  preferredChunkSize?: number;
  parallelUploads?: number;
  minChunkSizeForParallel?: number;
};

export type NegotiatedStrategy = {
  strategy: UploadStrategy;
  chunkSize: number;
  parallelUploads: number;
  reasoning: string[];
  warnings: string[];
};

export class UploadStrategyNegotiator {
  constructor(
    private capabilities: DataStoreCapabilities,
    private validateUploadStrategy: (strategy: UploadStrategy) => boolean,
  ) {}

  negotiateStrategy(options: UploadStrategyOptions): NegotiatedStrategy {
    const reasoning: string[] = [];
    const warnings: string[] = [];

    let strategy: UploadStrategy = "single";
    let chunkSize =
      options.preferredChunkSize ??
      this.capabilities.optimalChunkSize ??
      1024 * 1024;
    let parallelUploads = options.parallelUploads ?? 1;

    // Check if data store supports the preferred strategy
    if (options.preferredStrategy) {
      if (!this.validateUploadStrategy(options.preferredStrategy)) {
        warnings.push(
          `Preferred strategy '${options.preferredStrategy}' not supported by data store, falling back`,
        );
      } else {
        strategy = options.preferredStrategy;
        reasoning.push(`Using preferred strategy: ${strategy}`);
      }
    }

    // Automatic strategy selection based on capabilities and file size
    if (
      !options.preferredStrategy ||
      !this.validateUploadStrategy(options.preferredStrategy)
    ) {
      if (
        this.capabilities.supportsParallelUploads &&
        options.fileSize > (options.minChunkSizeForParallel ?? 10 * 1024 * 1024)
      ) {
        strategy = "parallel";
        reasoning.push(
          `Selected parallel upload for large file (${options.fileSize} bytes)`,
        );
      } else {
        strategy = "single";
        reasoning.push(
          this.capabilities.supportsParallelUploads
            ? `Selected single upload for small file (${options.fileSize} bytes)`
            : "Selected single upload (parallel not supported by data store)",
        );
      }
    }

    // Validate and adjust chunk size based on data store constraints
    if (
      this.capabilities.minChunkSize &&
      chunkSize < this.capabilities.minChunkSize
    ) {
      warnings.push(
        `Chunk size ${chunkSize} below minimum ${this.capabilities.minChunkSize}, adjusting`,
      );
      chunkSize = this.capabilities.minChunkSize;
    }

    if (
      this.capabilities.maxChunkSize &&
      chunkSize > this.capabilities.maxChunkSize
    ) {
      warnings.push(
        `Chunk size ${chunkSize} above maximum ${this.capabilities.maxChunkSize}, adjusting`,
      );
      chunkSize = this.capabilities.maxChunkSize;
    }

    // Validate parallel upload settings
    if (strategy === "parallel") {
      if (
        this.capabilities.maxConcurrentUploads &&
        parallelUploads > this.capabilities.maxConcurrentUploads
      ) {
        warnings.push(
          `Parallel uploads ${parallelUploads} exceeds maximum ${this.capabilities.maxConcurrentUploads}, adjusting`,
        );
        parallelUploads = this.capabilities.maxConcurrentUploads;
      }

      // Check if file would exceed max parts limit
      if (this.capabilities.maxParts) {
        const estimatedParts = Math.ceil(options.fileSize / chunkSize);
        if (estimatedParts > this.capabilities.maxParts) {
          const minChunkForParts = Math.ceil(
            options.fileSize / this.capabilities.maxParts,
          );
          warnings.push(
            `Estimated parts ${estimatedParts} exceeds maximum ${this.capabilities.maxParts}, increasing chunk size`,
          );
          chunkSize = Math.max(chunkSize, minChunkForParts);
        }
      }
    }

    // Final validation - ensure strategy is still valid after adjustments
    if (!this.validateUploadStrategy(strategy)) {
      warnings.push(
        `Final strategy validation failed, falling back to single upload`,
      );
      strategy = "single";
      parallelUploads = 1;
    }

    // Add capability information to reasoning
    reasoning.push(
      `Data store capabilities: parallel=${this.capabilities.supportsParallelUploads}, concatenation=${this.capabilities.supportsConcatenation}, resumable=${this.capabilities.supportsResumableUploads}`,
    );

    return {
      strategy,
      chunkSize,
      parallelUploads: strategy === "parallel" ? parallelUploads : 1,
      reasoning,
      warnings,
    };
  }

  getDataStoreCapabilities(): DataStoreCapabilities {
    return this.capabilities;
  }

  validateConfiguration(options: UploadStrategyOptions): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (
      options.preferredStrategy &&
      !this.validateUploadStrategy(options.preferredStrategy)
    ) {
      errors.push(
        `Preferred strategy '${options.preferredStrategy}' not supported by data store`,
      );
    }

    if (options.preferredChunkSize) {
      if (
        this.capabilities.minChunkSize &&
        options.preferredChunkSize < this.capabilities.minChunkSize
      ) {
        errors.push(
          `Chunk size ${options.preferredChunkSize} below data store minimum ${this.capabilities.minChunkSize}`,
        );
      }
      if (
        this.capabilities.maxChunkSize &&
        options.preferredChunkSize > this.capabilities.maxChunkSize
      ) {
        errors.push(
          `Chunk size ${options.preferredChunkSize} above data store maximum ${this.capabilities.maxChunkSize}`,
        );
      }
    }

    if (
      options.parallelUploads &&
      this.capabilities.maxConcurrentUploads &&
      options.parallelUploads > this.capabilities.maxConcurrentUploads
    ) {
      errors.push(
        `Parallel uploads ${options.parallelUploads} exceeds data store maximum ${this.capabilities.maxConcurrentUploads}`,
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
