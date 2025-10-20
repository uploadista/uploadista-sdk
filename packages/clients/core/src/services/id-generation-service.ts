/**
 * Platform-agnostic ID generation service
 */
export interface IdGenerationService {
  /**
   * Generate a unique identifier
   */
  generate(): string;
}
