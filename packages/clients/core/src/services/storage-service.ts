/**
 * Platform-agnostic storage service for persisting upload state
 */
export interface StorageService {
  /**
   * Get an item from storage
   */
  getItem(key: string): Promise<string | null>;

  /**
   * Set an item in storage
   */
  setItem(key: string, value: string): Promise<void>;

  /**
   * Remove an item from storage
   */
  removeItem(key: string): Promise<void>;

  /**
   * Get all items in storage
   */
  findAll(): Promise<Record<string, string>>;

  /**
   * Find items by prefix
   */
  find(prefix: string): Promise<Record<string, string>>;
}
