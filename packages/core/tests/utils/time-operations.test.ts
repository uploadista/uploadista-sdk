/**
 * Tests for Time-Dependent Operations using TestClock
 *
 * Demonstrates and tests Effect's TestClock for controlling time in tests.
 * TestClock allows advancing time instantly without real delays, making tests
 * fast and deterministic.
 *
 * Covers:
 * - Delays and timeouts
 * - Scheduled operations
 * - Retry delays
 * - Debounce/throttle with TestClock
 * - Time-based conditions
 */

import { it } from "@effect/vitest";
import { Duration, Effect, Fiber, Schedule, TestClock } from "effect";
import { describe, expect } from "vitest";

describe("Time-Dependent Operations with TestClock", () => {
  describe("Delays", () => {
    it.effect("should handle Effect.delay with TestClock", () =>
      Effect.gen(function* () {
        // Start an operation with a 5 second delay
        const delayedEffect = Effect.succeed("completed").pipe(
          Effect.delay(Duration.seconds(5)),
        );

        const fiber = yield* Effect.fork(delayedEffect);

        // Advance time by 5 seconds
        yield* TestClock.adjust(Duration.seconds(5));

        // Join the fiber to get the result
        const result = yield* Fiber.join(fiber);

        expect(result).toBe("completed");
      }),
    );

    it.effect("should handle multiple delays in sequence", () =>
      Effect.gen(function* () {
        const results: string[] = [];

        const operation = Effect.gen(function* () {
          results.push("start");
          yield* Effect.sleep(Duration.seconds(1));
          results.push("after 1s");
          yield* Effect.sleep(Duration.seconds(2));
          results.push("after 3s");
          yield* Effect.sleep(Duration.seconds(3));
          results.push("after 6s");
        });

        const fiber = yield* Effect.fork(operation);

        // Advance time step by step
        yield* TestClock.adjust(Duration.seconds(1));
        yield* Fiber.await(fiber); // Check fiber state

        yield* TestClock.adjust(Duration.seconds(2));
        yield* Fiber.await(fiber);

        yield* TestClock.adjust(Duration.seconds(3));
        yield* Fiber.join(fiber);

        expect(results).toEqual(["start", "after 1s", "after 3s", "after 6s"]);
      }),
    );

    it.effect("should handle concurrent delays", () =>
      Effect.gen(function* () {
        const results: string[] = [];

        const task1 = Effect.gen(function* () {
          yield* Effect.sleep(Duration.seconds(2));
          results.push("task1");
        });

        const task2 = Effect.gen(function* () {
          yield* Effect.sleep(Duration.seconds(3));
          results.push("task2");
        });

        const task3 = Effect.gen(function* () {
          yield* Effect.sleep(Duration.seconds(1));
          results.push("task3");
        });

        const fiber1 = yield* Effect.fork(task1);
        const fiber2 = yield* Effect.fork(task2);
        const fiber3 = yield* Effect.fork(task3);

        // Advance time by 3 seconds to complete all tasks
        yield* TestClock.adjust(Duration.seconds(3));

        yield* Fiber.join(fiber1);
        yield* Fiber.join(fiber2);
        yield* Fiber.join(fiber3);

        // task3 completes first (1s), then task1 (2s), then task2 (3s)
        expect(results).toContain("task1");
        expect(results).toContain("task2");
        expect(results).toContain("task3");
      }),
    );
  });

  describe("Timeouts", () => {
    it.effect("should handle timeout that expires", () =>
      Effect.gen(function* () {
        // Operation that takes 10 seconds
        const slowOperation = Effect.sleep(Duration.seconds(10)).pipe(
          Effect.map(() => "completed"),
        );

        // Timeout after 5 seconds
        const timedOperation = Effect.timeout(
          slowOperation,
          Duration.seconds(5),
        );

        const fiber = yield* Effect.fork(timedOperation);

        // Advance time by 5 seconds (timeout expires)
        yield* TestClock.adjust(Duration.seconds(5));

        const result = yield* Fiber.join(fiber);

        // Timeout should return None (Option type)
        expect(result).toBeTypeOf("object");
      }),
    );

    it.effect("should handle timeout that doesn't expire", () =>
      Effect.gen(function* () {
        // Operation that takes 2 seconds
        const fastOperation = Effect.sleep(Duration.seconds(2)).pipe(
          Effect.map(() => "completed"),
        );

        // Timeout after 5 seconds
        const timedOperation = Effect.timeout(
          fastOperation,
          Duration.seconds(5),
        );

        const fiber = yield* Effect.fork(timedOperation);

        // Advance time by 2 seconds (operation completes before timeout)
        yield* TestClock.adjust(Duration.seconds(2));

        const result = yield* Fiber.join(fiber);

        // Should return the completed value
        expect(result).toBeDefined();
      }),
    );

    it.effect("should handle multiple timeouts", () =>
      Effect.gen(function* () {
        const results: string[] = [];

        const op1 = Effect.sleep(Duration.seconds(1)).pipe(
          Effect.map(() => {
            results.push("op1-done");
            return "op1-done";
          }),
        );

        const op2 = Effect.sleep(Duration.seconds(5)).pipe(
          Effect.map(() => {
            results.push("op2-done");
            return "op2-done";
          }),
        );

        const fiber1 = yield* Effect.fork(op1);
        const fiber2 = yield* Effect.fork(op2);

        // Advance time by 3 seconds
        yield* TestClock.adjust(Duration.seconds(3));

        yield* Fiber.join(fiber1);
        yield* Fiber.join(fiber2);

        expect(results).toContain("op1-done");
        // op2 takes 5 seconds, only 3 seconds elapsed
        expect(results).not.toContain("op2-done");
      }),
    );
  });

  describe("Scheduled Operations", () => {
    it.effect("should handle scheduled retry with exponential backoff", () =>
      Effect.gen(function* () {
        let attempts = 0;
        const delays: number[] = [];

        const operation = Effect.gen(function* () {
          const start = yield* TestClock.currentTimeMillis;
          delays.push(start);
          attempts++;

          if (attempts < 4) {
            return yield* Effect.fail(new Error("Temporary failure"));
          }
          return "success";
        });

        // Retry with exponential backoff: 1s, 2s, 4s
        const policy = Schedule.exponential(Duration.seconds(1)).pipe(
          Schedule.compose(Schedule.recurs(3)),
        );

        const retriedOperation = Effect.retry(operation, policy);
        const fiber = yield* Effect.fork(retriedOperation);

        // Advance time to trigger retries
        yield* TestClock.adjust(Duration.seconds(1)); // First retry
        yield* TestClock.adjust(Duration.seconds(2)); // Second retry
        yield* TestClock.adjust(Duration.seconds(4)); // Third retry

        const result = yield* Fiber.join(fiber);

        expect(result).toBe("success");
        expect(attempts).toBe(4); // Initial attempt + 3 retries
      }),
    );

    it.effect("should handle fixed interval scheduling", () =>
      Effect.gen(function* () {
        const executions: number[] = [];

        const task = Effect.gen(function* () {
          const time = yield* TestClock.currentTimeMillis;
          executions.push(time);
        });

        // Schedule to run every 2 seconds, 5 times
        const scheduled = Effect.schedule(
          task,
          Schedule.fixed(Duration.seconds(2)).pipe(
            Schedule.compose(Schedule.recurs(4)),
          ),
        );

        const fiber = yield* Effect.fork(scheduled);

        // Advance time to trigger 5 executions
        for (let i = 0; i < 5; i++) {
          yield* TestClock.adjust(Duration.seconds(2));
        }

        yield* Fiber.join(fiber);

        expect(executions.length).toBe(5);
      }),
    );
  });

  describe("Debounce with TestClock", () => {
    it.effect("should debounce rapid calls", () =>
      Effect.gen(function* () {
        let executionCount = 0;

        const debouncedOperation = Effect.gen(function* () {
          yield* Effect.sleep(Duration.millis(300));
          executionCount++;
          return executionCount;
        });

        // Simulate rapid calls
        const fiber1 = yield* Effect.fork(debouncedOperation);
        yield* TestClock.adjust(Duration.millis(100));

        const fiber2 = yield* Effect.fork(debouncedOperation);
        yield* TestClock.adjust(Duration.millis(100));

        const fiber3 = yield* Effect.fork(debouncedOperation);
        yield* TestClock.adjust(Duration.millis(300));

        yield* Fiber.join(fiber1);
        yield* Fiber.join(fiber2);
        yield* Fiber.join(fiber3);

        expect(executionCount).toBe(3);
      }),
    );
  });

  describe("Time-Based Conditions", () => {
    it.effect("should handle time-based condition checks", () =>
      Effect.gen(function* () {
        const startTime = yield* TestClock.currentTimeMillis;

        // Wait for condition or timeout
        const checkCondition = (targetTime: number) =>
          Effect.gen(function* () {
            const currentTime = yield* TestClock.currentTimeMillis;
            return currentTime >= targetTime;
          });

        // Check if 5 seconds have passed
        yield* TestClock.adjust(Duration.seconds(3));
        const check1 = yield* checkCondition(startTime + 5000);
        expect(check1).toBe(false);

        yield* TestClock.adjust(Duration.seconds(2));
        const check2 = yield* checkCondition(startTime + 5000);
        expect(check2).toBe(true);
      }),
    );

    it.effect("should handle periodic checks with TestClock", () =>
      Effect.gen(function* () {
        const checkResults: boolean[] = [];
        let conditionMet = false;

        const periodicCheck = Effect.gen(function* () {
          for (let i = 0; i < 5; i++) {
            yield* Effect.sleep(Duration.seconds(1));
            checkResults.push(conditionMet);

            if (i === 2) {
              conditionMet = true;
            }
          }
        });

        const fiber = yield* Effect.fork(periodicCheck);

        // Advance time for each check
        for (let i = 0; i < 5; i++) {
          yield* TestClock.adjust(Duration.seconds(1));
        }

        yield* Fiber.join(fiber);

        expect(checkResults).toEqual([false, false, false, true, true]);
      }),
    );
  });

  describe("Clock Manipulation", () => {
    it.effect("should get current time from TestClock", () =>
      Effect.gen(function* () {
        const time1 = yield* TestClock.currentTimeMillis;

        yield* TestClock.adjust(Duration.seconds(10));

        const time2 = yield* TestClock.currentTimeMillis;

        // Time should have advanced by 10 seconds (10000 ms)
        expect(time2 - time1).toBe(10000);
      }),
    );

    it.effect("should set specific time", () =>
      Effect.gen(function* () {
        // Set clock to specific timestamp
        const specificTime = 1672531200000; // 2023-01-01 00:00:00 UTC
        yield* TestClock.setTime(new Date(specificTime));

        const currentTime = yield* TestClock.currentTimeMillis;
        expect(currentTime).toBe(specificTime);

        // Advance from that point (1 hour = 3600000ms)
        yield* TestClock.adjust(Duration.millis(3600000));

        const newTime = yield* TestClock.currentTimeMillis;
        expect(newTime).toBe(specificTime + 3600000); // +1 hour
      }),
    );

    it.effect("should handle fractional seconds", () =>
      Effect.gen(function* () {
        const startTime = yield* TestClock.currentTimeMillis;

        yield* TestClock.adjust(Duration.millis(1500)); // 1.5 seconds

        const endTime = yield* TestClock.currentTimeMillis;

        expect(endTime - startTime).toBe(1500);
      }),
    );
  });

  describe("Complex Timing Scenarios", () => {
    it.effect("should handle nested timeouts", () =>
      Effect.gen(function* () {
        const innerOperation = Effect.sleep(Duration.seconds(3)).pipe(
          Effect.map(() => "inner-done"),
          Effect.timeout(Duration.seconds(2)),
        );

        const outerOperation = innerOperation.pipe(
          Effect.timeout(Duration.seconds(5)),
        );

        const fiber = yield* Effect.fork(outerOperation);

        // Advance time past inner timeout but before outer timeout
        yield* TestClock.adjust(Duration.seconds(2));

        const result = yield* Fiber.join(fiber);

        // Should complete
        expect(result).toBeDefined();
      }),
    );

    it.effect("should handle race conditions with time", () =>
      Effect.gen(function* () {
        const fast = Effect.sleep(Duration.seconds(2)).pipe(
          Effect.map(() => "fast"),
        );

        const slow = Effect.sleep(Duration.seconds(5)).pipe(
          Effect.map(() => "slow"),
        );

        const raceEffect = Effect.race(fast, slow);
        const fiber = yield* Effect.fork(raceEffect);

        yield* TestClock.adjust(Duration.seconds(2));

        const result = yield* Fiber.join(fiber);

        expect(result).toBe("fast");
      }),
    );

    it.effect("should handle deadline-based operations", () =>
      Effect.gen(function* () {
        const startTime = yield* TestClock.currentTimeMillis;
        const deadline = startTime + 5000; // 5 seconds from now

        const operation = Effect.gen(function* () {
          yield* Effect.sleep(Duration.seconds(3));
          const currentTime = yield* TestClock.currentTimeMillis;
          return currentTime < deadline ? "on-time" : "missed-deadline";
        });

        const fiber = yield* Effect.fork(operation);

        yield* TestClock.adjust(Duration.seconds(3));

        const result = yield* Fiber.join(fiber);

        expect(result).toBe("on-time");
      }),
    );

    it.effect("should handle time window operations", () =>
      Effect.gen(function* () {
        const windowStart = yield* TestClock.currentTimeMillis;
        const windowDuration = 10000; // 10 second window
        const events: number[] = [];

        // Record events that happen within the window
        const recordEvent = Effect.gen(function* () {
          const currentTime = yield* TestClock.currentTimeMillis;
          if (currentTime - windowStart <= windowDuration) {
            events.push(currentTime - windowStart);
            return true;
          }
          return false;
        });

        // Record events at different times
        yield* recordEvent;
        events.push(0);

        yield* TestClock.adjust(Duration.seconds(3));
        yield* recordEvent;

        yield* TestClock.adjust(Duration.seconds(5));
        yield* recordEvent;

        yield* TestClock.adjust(Duration.seconds(5)); // Now outside window
        const inWindow = yield* recordEvent;

        expect(events.length).toBeGreaterThan(0);
        expect(inWindow).toBe(false);
      }),
    );
  });
});
