import type { DataStoreCapabilities, UploadStrategy } from "../types";

/**
 * Configuration options for upload strategy negotiation.
 *
 * @property fileSize - Size of the file to be uploaded in bytes
 * @property preferredStrategy - Preferred upload strategy (single, parallel, resumable)
 * @property preferredChunkSize - Preferred chunk size in bytes
 * @property parallelUploads - Number of parallel upload connections
 * @property minChunkSizeForParallel - Minimum file size to consider parallel uploads
 */
export type UploadStrategyOptions = {
  fileSize: number;
  preferredStrategy?: UploadStrategy;
  preferredChunkSize?: number;
  parallelUploads?: number;
  minChunkSizeForParallel?: number;
};

/**
 * Result of upload strategy negotiation.
 *
 * @property strategy - The negotiated upload strategy
 * @property chunkSize - The negotiated chunk size in bytes
 * @property parallelUploads - The negotiated number of parallel uploads
 * @property reasoning - Array of reasoning strings explaining the decisions
 * @property warnings - Array of warning messages about adjustments made
 */
export type NegotiatedStrategy = {
  strategy: UploadStrategy;
  chunkSize: number;
  parallelUploads: number;
  reasoning: string[];
  warnings: string[];
};

/**
 * Negotiates the optimal upload strategy based on data store capabilities and file characteristics.
 *
 * This class analyzes data store capabilities, file size, and user preferences to determine
 * the best upload strategy (single, parallel, resumable) and optimal parameters like chunk size
 * and parallel connection count.
 *
 * The negotiator considers:
 * - Data store capabilities (parallel uploads, resumable uploads, concatenation)
 * - File size and chunk size constraints
 * - User preferences and requirements
 * - Performance optimization opportunities
 *
 * @example
 * ```typescript
 * // Create negotiator for S3 data store
 * const negotiator = new UploadStrategyNegotiator(
 *   s3Capabilities,
 *   (strategy) => s3Capabilities.supportsStrategy(strategy)
 * );
 *
 * // Negotiate strategy for large file
 * const result = negotiator.negotiateStrategy({
 *   fileSize: 100_000_000, // 100MB
 *   preferredStrategy: "parallel",
 *   preferredChunkSize: 5_000_000, // 5MB chunks
 *   parallelUploads: 4
 * });
 *
 * console.log(result.strategy); // "parallel"
 * console.log(result.chunkSize); // 5_000_000
 * console.log(result.reasoning); // ["Using preferred strategy: parallel", ...]
 * ```
 */
export class UploadStrategyNegotiator {
  /**
   * Creates a new upload strategy negotiator.
   *
   * @param capabilities - Data store capabilities and constraints
   * @param validateUploadStrategy - Function to validate if a strategy is supported
   */
  constructor(
    private capabilities: DataStoreCapabilities,
    private validateUploadStrategy: (strategy: UploadStrategy) => boolean
  ) {}

  /**
   * Negotiates the optimal upload strategy based on options and data store capabilities.
   *
   * This method analyzes the provided options and data store capabilities to determine
   * the best upload strategy, chunk size, and parallel upload settings. It considers
   * user preferences, file size, and data store constraints to make optimal decisions.
   *
   * The negotiation process:
   * 1. Validates preferred strategy against data store capabilities
   * 2. Automatically selects strategy based on file size and capabilities
   * 3. Adjusts chunk size to fit within data store constraints
   * 4. Validates parallel upload settings
   * 5. Ensures final strategy is supported by the data store
   *
   * @param options - Upload strategy options including file size and preferences
   * @returns Negotiated strategy with reasoning and warnings
   *
   * @example
   * ```typescript
   * const result = negotiator.negotiateStrategy({
   *   fileSize: 50_000_000, // 50MB
   *   preferredStrategy: "parallel",
   *   preferredChunkSize: 5_000_000, // 5MB
   *   parallelUploads: 3
   * });
   *
   * console.log(result.strategy); // "parallel"
   * console.log(result.chunkSize); // 5_000_000
   * console.log(result.parallelUploads); // 3
   * console.log(result.reasoning); // ["Using preferred strategy: parallel", ...]
   * console.log(result.warnings); // [] (no warnings)
   * ```
   */
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
          `Preferred strategy '${options.preferredStrategy}' not supported by data store, falling back`
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
          `Selected parallel upload for large file (${options.fileSize} bytes)`
        );
      } else {
        strategy = "single";
        reasoning.push(
          this.capabilities.supportsParallelUploads
            ? `Selected single upload for small file (${options.fileSize} bytes)`
            : "Selected single upload (parallel not supported by data store)"
        );
      }
    }

    // Validate and adjust chunk size based on data store constraints
    if (
      this.capabilities.minChunkSize &&
      chunkSize < this.capabilities.minChunkSize
    ) {
      warnings.push(
        `Chunk size ${chunkSize} below minimum ${this.capabilities.minChunkSize}, adjusting`
      );
      chunkSize = this.capabilities.minChunkSize;
    }

    if (
      this.capabilities.maxChunkSize &&
      chunkSize > this.capabilities.maxChunkSize
    ) {
      warnings.push(
        `Chunk size ${chunkSize} above maximum ${this.capabilities.maxChunkSize}, adjusting`
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
          `Parallel uploads ${parallelUploads} exceeds maximum ${this.capabilities.maxConcurrentUploads}, adjusting`
        );
        parallelUploads = this.capabilities.maxConcurrentUploads;
      }

      // Check if file would exceed max parts limit
      if (this.capabilities.maxParts) {
        const estimatedParts = Math.ceil(options.fileSize / chunkSize);
        if (estimatedParts > this.capabilities.maxParts) {
          const minChunkForParts = Math.ceil(
            options.fileSize / this.capabilities.maxParts
          );
          warnings.push(
            `Estimated parts ${estimatedParts} exceeds maximum ${this.capabilities.maxParts}, increasing chunk size`
          );
          chunkSize = Math.max(chunkSize, minChunkForParts);
        }
      }
    }

    // Final validation - ensure strategy is still valid after adjustments
    if (!this.validateUploadStrategy(strategy)) {
      warnings.push(
        `Final strategy validation failed, falling back to single upload`
      );
      strategy = "single";
      parallelUploads = 1;
    }

    // Add capability information to reasoning
    reasoning.push(
      `Data store capabilities: parallel=${this.capabilities.supportsParallelUploads}, concatenation=${this.capabilities.supportsConcatenation}, resumable=${this.capabilities.supportsResumableUploads}`
    );

    return {
      strategy,
      chunkSize,
      parallelUploads: strategy === "parallel" ? parallelUploads : 1,
      reasoning,
      warnings,
    };
  }

  /**
   * Gets the data store capabilities used by this negotiator.
   *
   * @returns The data store capabilities and constraints
   */
  getDataStoreCapabilities(): DataStoreCapabilities {
    return this.capabilities;
  }

  /**
   * Validates upload strategy configuration against data store capabilities.
   *
   * This method checks if the provided configuration is valid for the current
   * data store capabilities without performing the actual negotiation. It's
   * useful for pre-validation before attempting to negotiate a strategy.
   *
   * @param options - Upload strategy options to validate
   * @returns Validation result with validity flag and error messages
   *
   * @example
   * ```typescript
   * const validation = negotiator.validateConfiguration({
   *   fileSize: 10_000_000,
   *   preferredStrategy: "parallel",
   *   preferredChunkSize: 1_000_000,
   *   parallelUploads: 5
   * });
   *
   * if (!validation.valid) {
   *   console.log("Configuration errors:", validation.errors);
   *   // Handle validation errors
   * }
   * ```
   */
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
        `Preferred strategy '${options.preferredStrategy}' not supported by data store`
      );
    }

    if (options.preferredChunkSize) {
      if (
        this.capabilities.minChunkSize &&
        options.preferredChunkSize < this.capabilities.minChunkSize
      ) {
        errors.push(
          `Chunk size ${options.preferredChunkSize} below data store minimum ${this.capabilities.minChunkSize}`
        );
      }
      if (
        this.capabilities.maxChunkSize &&
        options.preferredChunkSize > this.capabilities.maxChunkSize
      ) {
        errors.push(
          `Chunk size ${options.preferredChunkSize} above data store maximum ${this.capabilities.maxChunkSize}`
        );
      }
    }

    if (
      options.parallelUploads &&
      this.capabilities.maxConcurrentUploads &&
      options.parallelUploads > this.capabilities.maxConcurrentUploads
    ) {
      errors.push(
        `Parallel uploads ${options.parallelUploads} exceeds data store maximum ${this.capabilities.maxConcurrentUploads}`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
