import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	EventSubscriptionManager,
	type EventFilterOptions,
	type EventHandler,
	type EventSource,
	type GenericEvent,
} from "../event-subscription-manager";

describe("EventSubscriptionManager", () => {
	interface TestEvent extends GenericEvent {
		type: string;
		data?: {
			id?: string;
			priority?: string;
			value?: number;
		};
	}

	let mockEventSource: EventSource<TestEvent>;
	let eventHandlers: EventHandler<TestEvent>[];

	beforeEach(() => {
		eventHandlers = [];

		mockEventSource = {
			subscribe: vi.fn((handler: EventHandler<TestEvent>) => {
				eventHandlers.push(handler);
				return () => {
					const index = eventHandlers.indexOf(handler);
					if (index !== -1) {
						eventHandlers.splice(index, 1);
					}
				};
			}),
		};
	});

	const emitEvent = (event: TestEvent) => {
		for (const handler of eventHandlers) {
			handler(event);
		}
	};

	describe("constructor", () => {
		it("should create manager with event source", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			expect(manager).toBeInstanceOf(EventSubscriptionManager);
		});

		it("should start with zero subscriptions", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			expect(manager.getSubscriptionCount()).toBe(0);
			expect(manager.hasSubscriptions()).toBe(false);
		});
	});

	describe("subscribe", () => {
		it("should subscribe to event source", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			const handler = vi.fn();

			manager.subscribe(handler);

			expect(mockEventSource.subscribe).toHaveBeenCalledWith(
				expect.any(Function),
			);
		});

		it("should call handler when event occurs", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			const handler = vi.fn();

			manager.subscribe(handler);

			const event: TestEvent = { type: "UPLOAD_PROGRESS", data: { value: 50 } };
			emitEvent(event);

			expect(handler).toHaveBeenCalledWith(event);
		});

		it("should return unsubscribe function", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			const handler = vi.fn();

			const unsubscribe = manager.subscribe(handler);

			expect(typeof unsubscribe).toBe("function");
		});

		it("should increment subscription count", () => {
			const manager = new EventSubscriptionManager(mockEventSource);

			expect(manager.getSubscriptionCount()).toBe(0);

			manager.subscribe(vi.fn());
			expect(manager.getSubscriptionCount()).toBe(1);

			manager.subscribe(vi.fn());
			expect(manager.getSubscriptionCount()).toBe(2);
		});

		it("should track multiple subscriptions independently", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			const handler1 = vi.fn();
			const handler2 = vi.fn();

			manager.subscribe(handler1);
			manager.subscribe(handler2);

			const event: TestEvent = { type: "TEST" };
			emitEvent(event);

			expect(handler1).toHaveBeenCalledWith(event);
			expect(handler2).toHaveBeenCalledWith(event);
		});
	});

	describe("event filtering", () => {
		describe("by event type", () => {
			it("should filter events by type", () => {
				const manager = new EventSubscriptionManager(mockEventSource);
				const handler = vi.fn();

				manager.subscribe(handler, { eventType: "UPLOAD_PROGRESS" });

				emitEvent({ type: "UPLOAD_PROGRESS" });
				emitEvent({ type: "UPLOAD_ERROR" });
				emitEvent({ type: "UPLOAD_PROGRESS" });

				expect(handler).toHaveBeenCalledTimes(2);
				expect(handler).toHaveBeenCalledWith({ type: "UPLOAD_PROGRESS" });
			});

			it("should pass all events when no type filter", () => {
				const manager = new EventSubscriptionManager(mockEventSource);
				const handler = vi.fn();

				manager.subscribe(handler);

				emitEvent({ type: "TYPE_A" });
				emitEvent({ type: "TYPE_B" });
				emitEvent({ type: "TYPE_C" });

				expect(handler).toHaveBeenCalledTimes(3);
			});
		});

		describe("by upload ID", () => {
			it("should filter events by upload ID", () => {
				const manager = new EventSubscriptionManager(mockEventSource);
				const handler = vi.fn();

				manager.subscribe(handler, { uploadId: "upload-123" });

				emitEvent({ type: "PROGRESS", data: { id: "upload-123" } });
				emitEvent({ type: "PROGRESS", data: { id: "upload-456" } });
				emitEvent({ type: "PROGRESS", data: { id: "upload-123" } });

				expect(handler).toHaveBeenCalledTimes(2);
				expect(handler).toHaveBeenCalledWith({
					type: "PROGRESS",
					data: { id: "upload-123" },
				});
			});

			it("should filter for null ID (events without ID)", () => {
				const manager = new EventSubscriptionManager(mockEventSource);
				const handler = vi.fn();

				manager.subscribe(handler, { uploadId: null });

				emitEvent({ type: "GENERAL" });
				emitEvent({ type: "UPLOAD", data: { id: "upload-123" } });
				emitEvent({ type: "GENERAL", data: {} });

				// Should only get events without an ID
				expect(handler).toHaveBeenCalledTimes(2);
			});

			it("should handle missing data gracefully", () => {
				const manager = new EventSubscriptionManager(mockEventSource);
				const handler = vi.fn();

				manager.subscribe(handler, { uploadId: "upload-123" });

				emitEvent({ type: "EVENT", data: undefined });
				emitEvent({ type: "EVENT" });

				expect(handler).not.toHaveBeenCalled();
			});
		});

		describe("by custom filter", () => {
			it("should apply custom filter function", () => {
				const manager = new EventSubscriptionManager(mockEventSource);
				const handler = vi.fn();

				manager.subscribe(handler, {
					customFilter: (event) =>
						(event.data as { priority?: string })?.priority === "high",
				});

				emitEvent({ type: "TASK", data: { priority: "high" } });
				emitEvent({ type: "TASK", data: { priority: "low" } });
				emitEvent({ type: "TASK", data: { priority: "high" } });

				expect(handler).toHaveBeenCalledTimes(2);
			});

			it("should combine event type and custom filter", () => {
				const manager = new EventSubscriptionManager(mockEventSource);
				const handler = vi.fn();

				manager.subscribe(handler, {
					eventType: "PROGRESS",
					customFilter: (event) =>
						((event.data as { value?: number })?.value ?? 0) > 50,
				});

				emitEvent({ type: "PROGRESS", data: { value: 75 } }); // pass
				emitEvent({ type: "PROGRESS", data: { value: 25 } }); // fail custom
				emitEvent({ type: "ERROR", data: { value: 75 } }); // fail type
				emitEvent({ type: "PROGRESS", data: { value: 100 } }); // pass

				expect(handler).toHaveBeenCalledTimes(2);
			});

			it("should apply all filters together", () => {
				const manager = new EventSubscriptionManager(mockEventSource);
				const handler = vi.fn();

				manager.subscribe(handler, {
					eventType: "PROGRESS",
					uploadId: "upload-123",
					customFilter: (event) =>
						((event.data as { value?: number })?.value ?? 0) > 50,
				});

				// All pass
				emitEvent({
					type: "PROGRESS",
					data: { id: "upload-123", value: 75 },
				});

				// Fail type
				emitEvent({ type: "ERROR", data: { id: "upload-123", value: 75 } });

				// Fail ID
				emitEvent({
					type: "PROGRESS",
					data: { id: "upload-456", value: 75 },
				});

				// Fail custom filter
				emitEvent({
					type: "PROGRESS",
					data: { id: "upload-123", value: 25 },
				});

				expect(handler).toHaveBeenCalledTimes(1);
			});
		});
	});

	describe("unsubscribe", () => {
		it("should stop receiving events after unsubscribe", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			const handler = vi.fn();

			const unsubscribe = manager.subscribe(handler);

			emitEvent({ type: "TEST" });
			expect(handler).toHaveBeenCalledTimes(1);

			unsubscribe();

			emitEvent({ type: "TEST" });
			expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
		});

		it("should decrement subscription count", () => {
			const manager = new EventSubscriptionManager(mockEventSource);

			const unsub1 = manager.subscribe(vi.fn());
			const unsub2 = manager.subscribe(vi.fn());

			expect(manager.getSubscriptionCount()).toBe(2);

			unsub1();
			expect(manager.getSubscriptionCount()).toBe(1);

			unsub2();
			expect(manager.getSubscriptionCount()).toBe(0);
		});

		it("should only affect specific subscription", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			const handler1 = vi.fn();
			const handler2 = vi.fn();

			const unsub1 = manager.subscribe(handler1);
			manager.subscribe(handler2);

			unsub1();

			emitEvent({ type: "TEST" });

			expect(handler1).not.toHaveBeenCalled();
			expect(handler2).toHaveBeenCalled();
		});

		it("should be safe to call unsubscribe multiple times", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			const handler = vi.fn();

			const unsubscribe = manager.subscribe(handler);

			unsubscribe();
			expect(() => unsubscribe()).not.toThrow();
			expect(manager.getSubscriptionCount()).toBe(0);
		});
	});

	describe("getSubscriptionCount", () => {
		it("should return correct count", () => {
			const manager = new EventSubscriptionManager(mockEventSource);

			expect(manager.getSubscriptionCount()).toBe(0);

			const unsub1 = manager.subscribe(vi.fn());
			expect(manager.getSubscriptionCount()).toBe(1);

			const unsub2 = manager.subscribe(vi.fn());
			expect(manager.getSubscriptionCount()).toBe(2);

			const unsub3 = manager.subscribe(vi.fn());
			expect(manager.getSubscriptionCount()).toBe(3);

			unsub2();
			expect(manager.getSubscriptionCount()).toBe(2);

			unsub1();
			unsub3();
			expect(manager.getSubscriptionCount()).toBe(0);
		});
	});

	describe("hasSubscriptions", () => {
		it("should return false when no subscriptions", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			expect(manager.hasSubscriptions()).toBe(false);
		});

		it("should return true when subscriptions exist", () => {
			const manager = new EventSubscriptionManager(mockEventSource);

			manager.subscribe(vi.fn());
			expect(manager.hasSubscriptions()).toBe(true);
		});

		it("should return false after all unsubscribed", () => {
			const manager = new EventSubscriptionManager(mockEventSource);

			const unsub1 = manager.subscribe(vi.fn());
			const unsub2 = manager.subscribe(vi.fn());

			expect(manager.hasSubscriptions()).toBe(true);

			unsub1();
			expect(manager.hasSubscriptions()).toBe(true);

			unsub2();
			expect(manager.hasSubscriptions()).toBe(false);
		});
	});

	describe("cleanup", () => {
		it("should unsubscribe all subscriptions", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			const handler1 = vi.fn();
			const handler2 = vi.fn();
			const handler3 = vi.fn();

			manager.subscribe(handler1);
			manager.subscribe(handler2);
			manager.subscribe(handler3);

			expect(manager.getSubscriptionCount()).toBe(3);

			manager.cleanup();

			expect(manager.getSubscriptionCount()).toBe(0);
			expect(manager.hasSubscriptions()).toBe(false);
		});

		it("should stop all handlers from receiving events", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			const handler1 = vi.fn();
			const handler2 = vi.fn();

			manager.subscribe(handler1);
			manager.subscribe(handler2);

			manager.cleanup();

			emitEvent({ type: "TEST" });

			expect(handler1).not.toHaveBeenCalled();
			expect(handler2).not.toHaveBeenCalled();
		});

		it("should be safe to call multiple times", () => {
			const manager = new EventSubscriptionManager(mockEventSource);

			manager.subscribe(vi.fn());
			manager.subscribe(vi.fn());

			manager.cleanup();
			expect(() => manager.cleanup()).not.toThrow();
			expect(manager.getSubscriptionCount()).toBe(0);
		});

		it("should allow new subscriptions after cleanup", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			const handler1 = vi.fn();

			manager.subscribe(handler1);
			manager.cleanup();

			const handler2 = vi.fn();
			manager.subscribe(handler2);

			emitEvent({ type: "TEST" });

			expect(handler1).not.toHaveBeenCalled();
			expect(handler2).toHaveBeenCalled();
			expect(manager.getSubscriptionCount()).toBe(1);
		});
	});

	describe("updateUploadIdFilter", () => {
		it("should update upload ID in existing filters", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			const handler = vi.fn();

			manager.subscribe(handler, { uploadId: "upload-old" });

			emitEvent({ type: "PROGRESS", data: { id: "upload-old" } });
			expect(handler).toHaveBeenCalledTimes(1);

			handler.mockClear();
			manager.updateUploadIdFilter("upload-new");

			emitEvent({ type: "PROGRESS", data: { id: "upload-old" } });
			emitEvent({ type: "PROGRESS", data: { id: "upload-new" } });

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler).toHaveBeenCalledWith({
				type: "PROGRESS",
				data: { id: "upload-new" },
			});
		});

		it("should update multiple subscriptions with upload ID filter", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			const handler1 = vi.fn();
			const handler2 = vi.fn();

			manager.subscribe(handler1, { uploadId: "old" });
			manager.subscribe(handler2, { uploadId: "old" });

			manager.updateUploadIdFilter("new");

			emitEvent({ type: "EVENT", data: { id: "new" } });

			expect(handler1).toHaveBeenCalled();
			expect(handler2).toHaveBeenCalled();
		});

		it("should not affect subscriptions without upload ID filter", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			const handler1 = vi.fn();
			const handler2 = vi.fn();

			manager.subscribe(handler1, { uploadId: "upload-1" });
			manager.subscribe(handler2, { eventType: "PROGRESS" });

			manager.updateUploadIdFilter("upload-2");

			emitEvent({ type: "PROGRESS", data: { id: "upload-2" } });

			// handler1 should get event (uploadId was updated)
			expect(handler1).toHaveBeenCalled();

			// handler2 should get event (no uploadId filter)
			expect(handler2).toHaveBeenCalled();
		});

		it("should handle null upload ID", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			const handler = vi.fn();

			manager.subscribe(handler, { uploadId: "upload-123" });

			manager.updateUploadIdFilter(null);

			emitEvent({ type: "EVENT" });
			emitEvent({ type: "EVENT", data: { id: "upload-123" } });

			// Should only get event without ID
			expect(handler).toHaveBeenCalledTimes(1);
		});
	});

	describe("edge cases", () => {
		it("should handle events with no type", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			const handler = vi.fn();

			manager.subscribe(handler);

			// @ts-expect-error - Testing edge case
			emitEvent({});

			expect(handler).toHaveBeenCalled();
		});

		it("should handle rapid subscribe/unsubscribe", () => {
			const manager = new EventSubscriptionManager(mockEventSource);

			for (let i = 0; i < 100; i++) {
				const unsub = manager.subscribe(vi.fn());
				unsub();
			}

			expect(manager.getSubscriptionCount()).toBe(0);
		});

		it("should handle unsubscribe during event handling", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			let unsubscribe: (() => void) | null = null;

			const handler = vi.fn(() => {
				unsubscribe?.();
			});

			unsubscribe = manager.subscribe(handler);

			expect(() => emitEvent({ type: "TEST" })).not.toThrow();
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("should handle filter with undefined uploadId explicitly", () => {
			const manager = new EventSubscriptionManager(mockEventSource);
			const handler = vi.fn();

			manager.subscribe(handler, { uploadId: undefined });

			emitEvent({ type: "EVENT", data: { id: "upload-123" } });
			emitEvent({ type: "EVENT" });

			// uploadId: undefined should be treated as "no filter"
			expect(handler).toHaveBeenCalledTimes(2);
		});
	});
});
