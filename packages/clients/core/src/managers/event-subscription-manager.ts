/**
 * Generic event type that the subscription manager can handle
 */
export interface GenericEvent {
  type: string;
  data?: unknown;
}

/**
 * Event handler callback function
 */
export type EventHandler<T = GenericEvent> = (event: T) => void;

/**
 * Unsubscribe function returned from subscriptions
 */
export type UnsubscribeFunction = () => void;

/**
 * Event source that provides subscription capabilities
 */
export interface EventSource<T = GenericEvent> {
  /**
   * Subscribe to events from this source
   * @returns Unsubscribe function to clean up the subscription
   */
  subscribe(handler: EventHandler<T>): UnsubscribeFunction;
}

/**
 * Options for event filtering
 */
export interface EventFilterOptions {
  /**
   * Filter events by type (exact match)
   */
  eventType?: string;

  /**
   * Filter events by upload/job ID
   * If provided, only events with matching ID will be passed to the handler
   */
  uploadId?: string | null;

  /**
   * Custom filter function for advanced filtering
   * Return true to pass the event to the handler
   */
  customFilter?: (event: GenericEvent) => boolean;
}

/**
 * Subscription information for tracking
 */
interface SubscriptionInfo<T extends GenericEvent = GenericEvent> {
  unsubscribe: UnsubscribeFunction;
  handler: EventHandler<T>;
  filter?: EventFilterOptions;
}

/**
 * Platform-agnostic event subscription manager that handles event filtering,
 * subscription tracking, and automatic cleanup.
 *
 * This manager simplifies event handling by:
 * - Filtering events by type and/or ID
 * - Tracking all active subscriptions
 * - Providing cleanup methods to unsubscribe from all events
 * - Supporting custom filter functions for advanced scenarios
 *
 * @example Basic event subscription
 * ```typescript
 * const manager = new EventSubscriptionManager(eventSource);
 *
 * manager.subscribe(
 *   (event) => console.log('Upload progress:', event),
 *   { eventType: 'UPLOAD_PROGRESS', uploadId: 'abc123' }
 * );
 *
 * // Clean up all subscriptions when done
 * manager.cleanup();
 * ```
 *
 * @example Multiple filtered subscriptions
 * ```typescript
 * const manager = new EventSubscriptionManager(eventSource);
 *
 * // Subscribe to progress events for specific upload
 * manager.subscribe(
 *   onProgress,
 *   { eventType: 'UPLOAD_PROGRESS', uploadId: currentUploadId }
 * );
 *
 * // Subscribe to error events for any upload
 * manager.subscribe(
 *   onError,
 *   { eventType: 'UPLOAD_ERROR' }
 * );
 *
 * // Subscribe to all events with custom filtering
 * manager.subscribe(
 *   onEvent,
 *   { customFilter: (e) => e.data?.priority === 'high' }
 * );
 * ```
 */
export class EventSubscriptionManager<T extends GenericEvent = GenericEvent> {
  private subscriptions: SubscriptionInfo<T>[] = [];

  /**
   * Create a new EventSubscriptionManager
   *
   * @param eventSource - Source to subscribe to for events
   */
  constructor(private readonly eventSource: EventSource<T>) {}

  /**
   * Subscribe to events with optional filtering
   *
   * @param handler - Callback function to invoke when matching events occur
   * @param filter - Optional filter options to narrow down which events trigger the handler
   * @returns Unsubscribe function to remove this specific subscription
   *
   * @example Subscribe to specific event type
   * ```typescript
   * const unsubscribe = manager.subscribe(
   *   (event) => console.log('Progress:', event),
   *   { eventType: 'UPLOAD_PROGRESS' }
   * );
   *
   * // Later, unsubscribe
   * unsubscribe();
   * ```
   */
  subscribe(
    handler: EventHandler<T>,
    filter?: EventFilterOptions,
  ): UnsubscribeFunction {
    // Create a wrapper handler that applies filtering
    const wrappedHandler: EventHandler<T> = (event: T) => {
      if (this.shouldHandleEvent(event, filter)) {
        handler(event);
      }
    };

    // Subscribe to the event source with the wrapped handler
    const unsubscribe = this.eventSource.subscribe(wrappedHandler);

    // Track this subscription
    const subscription: SubscriptionInfo<T> = {
      unsubscribe,
      handler: wrappedHandler,
      filter,
    };

    this.subscriptions.push(subscription);

    // Return unsubscribe function that also removes from tracking
    return () => {
      const index = this.subscriptions.indexOf(subscription);
      if (index !== -1) {
        this.subscriptions.splice(index, 1);
      }
      unsubscribe();
    };
  }

  /**
   * Check if an event matches the filter criteria
   *
   * @param event - Event to check
   * @param filter - Filter options to apply
   * @returns True if the event passes all filters
   */
  private shouldHandleEvent(event: T, filter?: EventFilterOptions): boolean {
    if (!filter) {
      return true;
    }

    // Check event type filter
    if (filter.eventType && event.type !== filter.eventType) {
      return false;
    }

    // Check upload ID filter
    if (filter.uploadId !== undefined) {
      const eventData = event.data as { id?: string } | undefined;
      const eventId = eventData?.id;

      // If filter.uploadId is null, only pass events without an ID
      // If filter.uploadId is a string, only pass events with matching ID
      if (filter.uploadId === null) {
        if (eventId !== undefined) {
          return false;
        }
      } else if (eventId !== filter.uploadId) {
        return false;
      }
    }

    // Check custom filter
    if (filter.customFilter) {
      // Cast to GenericEvent for custom filter as it operates on the base interface
      return filter.customFilter(event as unknown as GenericEvent);
    }

    return true;
  }

  /**
   * Get the number of active subscriptions
   *
   * @returns Number of tracked subscriptions
   */
  getSubscriptionCount(): number {
    return this.subscriptions.length;
  }

  /**
   * Check if there are any active subscriptions
   *
   * @returns True if at least one subscription is active
   */
  hasSubscriptions(): boolean {
    return this.subscriptions.length > 0;
  }

  /**
   * Unsubscribe from all tracked subscriptions and clear the subscription list
   *
   * This is typically called when disposing of a component or cleaning up resources.
   *
   * @example Cleanup in framework hooks
   * ```typescript
   * // React
   * useEffect(() => {
   *   const manager = new EventSubscriptionManager(eventSource);
   *   manager.subscribe(handler, filter);
   *
   *   return () => manager.cleanup();
   * }, []);
   *
   * // Vue
   * onUnmounted(() => {
   *   manager.cleanup();
   * });
   * ```
   */
  cleanup(): void {
    for (const subscription of this.subscriptions) {
      subscription.unsubscribe();
    }
    this.subscriptions = [];
  }

  /**
   * Update the upload ID filter for all subscriptions that have an uploadId filter
   *
   * This is useful when the current upload changes and you want to update
   * all subscriptions to listen for the new upload's events.
   *
   * @param newUploadId - New upload ID to filter events by
   *
   * @example Update upload ID when starting new upload
   * ```typescript
   * const manager = new EventSubscriptionManager(eventSource);
   * manager.subscribe(onProgress, { eventType: 'UPLOAD_PROGRESS', uploadId: null });
   *
   * // When upload starts
   * manager.updateUploadIdFilter(uploadId);
   * ```
   */
  updateUploadIdFilter(newUploadId: string | null): void {
    for (const subscription of this.subscriptions) {
      if (subscription.filter && subscription.filter.uploadId !== undefined) {
        subscription.filter.uploadId = newUploadId;
      }
    }
  }
}
