import { describe, expect, it } from "vitest";
import {
  calculateBackoffDelay,
  calculateExpirationDate,
  DEFAULT_RETRY_POLICY,
  isErrorRetryable,
  type BackoffStrategy,
  type RetryPolicy,
} from "../../src/flow/types/retry-policy";

describe("RetryPolicy", () => {
  describe("calculateBackoffDelay", () => {
    describe("immediate backoff", () => {
      const immediateBackoff: BackoffStrategy = { type: "immediate" };

      it("should return 0 for immediate backoff", () => {
        expect(calculateBackoffDelay(immediateBackoff, 0)).toBe(0);
        expect(calculateBackoffDelay(immediateBackoff, 1)).toBe(0);
        expect(calculateBackoffDelay(immediateBackoff, 5)).toBe(0);
        expect(calculateBackoffDelay(immediateBackoff, 100)).toBe(0);
      });
    });

    describe("fixed backoff", () => {
      const fixedBackoff: BackoffStrategy = { type: "fixed", delayMs: 5000 };

      it("should return fixed delay regardless of retry count", () => {
        expect(calculateBackoffDelay(fixedBackoff, 0)).toBe(5000);
        expect(calculateBackoffDelay(fixedBackoff, 1)).toBe(5000);
        expect(calculateBackoffDelay(fixedBackoff, 5)).toBe(5000);
        expect(calculateBackoffDelay(fixedBackoff, 100)).toBe(5000);
      });

      it("should handle zero delay", () => {
        const zeroDelayBackoff: BackoffStrategy = { type: "fixed", delayMs: 0 };
        expect(calculateBackoffDelay(zeroDelayBackoff, 0)).toBe(0);
      });

      it("should handle large delay", () => {
        const largeDelayBackoff: BackoffStrategy = {
          type: "fixed",
          delayMs: 3600000, // 1 hour
        };
        expect(calculateBackoffDelay(largeDelayBackoff, 0)).toBe(3600000);
      });
    });

    describe("exponential backoff without jitter", () => {
      const exponentialBackoff: BackoffStrategy = {
        type: "exponential",
        initialDelayMs: 1000,
        maxDelayMs: 60000,
        multiplier: 2,
        jitter: false,
      };

      it("should calculate correct delays for each retry", () => {
        expect(calculateBackoffDelay(exponentialBackoff, 0)).toBe(1000); // 1000 * 2^0
        expect(calculateBackoffDelay(exponentialBackoff, 1)).toBe(2000); // 1000 * 2^1
        expect(calculateBackoffDelay(exponentialBackoff, 2)).toBe(4000); // 1000 * 2^2
        expect(calculateBackoffDelay(exponentialBackoff, 3)).toBe(8000); // 1000 * 2^3
        expect(calculateBackoffDelay(exponentialBackoff, 4)).toBe(16000); // 1000 * 2^4
        expect(calculateBackoffDelay(exponentialBackoff, 5)).toBe(32000); // 1000 * 2^5
      });

      it("should cap at maxDelayMs", () => {
        expect(calculateBackoffDelay(exponentialBackoff, 6)).toBe(60000); // Would be 64000, capped at 60000
        expect(calculateBackoffDelay(exponentialBackoff, 10)).toBe(60000); // Would be 1024000, capped at 60000
      });

      it("should handle multiplier of 1 (no increase)", () => {
        const noIncreaseBackoff: BackoffStrategy = {
          type: "exponential",
          initialDelayMs: 1000,
          maxDelayMs: 60000,
          multiplier: 1,
          jitter: false,
        };
        expect(calculateBackoffDelay(noIncreaseBackoff, 0)).toBe(1000);
        expect(calculateBackoffDelay(noIncreaseBackoff, 5)).toBe(1000);
      });

      it("should handle multiplier of 3", () => {
        const tripleBackoff: BackoffStrategy = {
          type: "exponential",
          initialDelayMs: 1000,
          maxDelayMs: 100000,
          multiplier: 3,
          jitter: false,
        };
        expect(calculateBackoffDelay(tripleBackoff, 0)).toBe(1000); // 1000 * 3^0
        expect(calculateBackoffDelay(tripleBackoff, 1)).toBe(3000); // 1000 * 3^1
        expect(calculateBackoffDelay(tripleBackoff, 2)).toBe(9000); // 1000 * 3^2
        expect(calculateBackoffDelay(tripleBackoff, 3)).toBe(27000); // 1000 * 3^3
        expect(calculateBackoffDelay(tripleBackoff, 4)).toBe(81000); // 1000 * 3^4
      });
    });

    describe("exponential backoff with jitter", () => {
      const exponentialBackoffWithJitter: BackoffStrategy = {
        type: "exponential",
        initialDelayMs: 1000,
        maxDelayMs: 60000,
        multiplier: 2,
        jitter: true,
      };

      it("should return delay within expected range (0.5x to 1.5x)", () => {
        // Run multiple times to test randomness
        for (let i = 0; i < 100; i++) {
          const delay = calculateBackoffDelay(exponentialBackoffWithJitter, 0);
          // Base delay for retry 0 is 1000ms
          // With jitter: 500ms to 1500ms
          expect(delay).toBeGreaterThanOrEqual(500);
          expect(delay).toBeLessThanOrEqual(1500);
        }
      });

      it("should still respect maxDelayMs even with jitter", () => {
        for (let i = 0; i < 100; i++) {
          const delay = calculateBackoffDelay(exponentialBackoffWithJitter, 10);
          // Max delay is 60000, with jitter factor 0.5-1.5, range is 30000-90000
          // But implementation caps first, then applies jitter, so max is 60000 * 1.5 = 90000
          expect(delay).toBeGreaterThanOrEqual(30000);
          expect(delay).toBeLessThanOrEqual(90000);
        }
      });

      it("should produce different values due to randomness", () => {
        const delays = new Set<number>();
        for (let i = 0; i < 20; i++) {
          delays.add(calculateBackoffDelay(exponentialBackoffWithJitter, 2));
        }
        // With randomness, we should get multiple different values
        expect(delays.size).toBeGreaterThan(1);
      });
    });
  });

  describe("isErrorRetryable", () => {
    const basePolicy: RetryPolicy = {
      enabled: true,
      maxRetries: 3,
      backoff: { type: "immediate" },
    };

    it("should return false when policy is disabled", () => {
      const disabledPolicy: RetryPolicy = { ...basePolicy, enabled: false };
      expect(isErrorRetryable("NETWORK_ERROR", disabledPolicy)).toBe(false);
      expect(isErrorRetryable("VALIDATION_ERROR", disabledPolicy)).toBe(false);
    });

    it("should return true for all errors when no filters specified", () => {
      expect(isErrorRetryable("NETWORK_ERROR", basePolicy)).toBe(true);
      expect(isErrorRetryable("TIMEOUT_ERROR", basePolicy)).toBe(true);
      expect(isErrorRetryable("UNKNOWN_ERROR", basePolicy)).toBe(true);
      expect(isErrorRetryable("VALIDATION_ERROR", basePolicy)).toBe(true);
    });

    it("should return false for non-retryable errors", () => {
      const policyWithNonRetryable: RetryPolicy = {
        ...basePolicy,
        nonRetryableErrors: ["VALIDATION_ERROR", "AUTH_ERROR"],
      };
      expect(isErrorRetryable("VALIDATION_ERROR", policyWithNonRetryable)).toBe(
        false,
      );
      expect(isErrorRetryable("AUTH_ERROR", policyWithNonRetryable)).toBe(false);
      expect(isErrorRetryable("NETWORK_ERROR", policyWithNonRetryable)).toBe(
        true,
      );
    });

    it("should only retry specified errors when retryableErrors is set", () => {
      const policyWithRetryable: RetryPolicy = {
        ...basePolicy,
        retryableErrors: ["NETWORK_ERROR", "TIMEOUT_ERROR"],
      };
      expect(isErrorRetryable("NETWORK_ERROR", policyWithRetryable)).toBe(true);
      expect(isErrorRetryable("TIMEOUT_ERROR", policyWithRetryable)).toBe(true);
      expect(isErrorRetryable("VALIDATION_ERROR", policyWithRetryable)).toBe(
        false,
      );
      expect(isErrorRetryable("UNKNOWN_ERROR", policyWithRetryable)).toBe(false);
    });

    it("should prioritize non-retryable over retryable", () => {
      const policyWithBoth: RetryPolicy = {
        ...basePolicy,
        retryableErrors: ["NETWORK_ERROR", "VALIDATION_ERROR"],
        nonRetryableErrors: ["VALIDATION_ERROR"],
      };
      // VALIDATION_ERROR is in both lists, but non-retryable takes precedence
      expect(isErrorRetryable("VALIDATION_ERROR", policyWithBoth)).toBe(false);
      expect(isErrorRetryable("NETWORK_ERROR", policyWithBoth)).toBe(true);
    });

    it("should handle empty retryableErrors array", () => {
      const policyWithEmptyRetryable: RetryPolicy = {
        ...basePolicy,
        retryableErrors: [],
      };
      // Empty retryableErrors means all errors are retryable (same as undefined)
      // This is because the check is for length > 0
      expect(isErrorRetryable("NETWORK_ERROR", policyWithEmptyRetryable)).toBe(
        true,
      );
    });

    it("should handle empty nonRetryableErrors array", () => {
      const policyWithEmptyNonRetryable: RetryPolicy = {
        ...basePolicy,
        nonRetryableErrors: [],
      };
      // Empty nonRetryableErrors has no effect
      expect(isErrorRetryable("NETWORK_ERROR", policyWithEmptyNonRetryable)).toBe(
        true,
      );
    });
  });

  describe("calculateExpirationDate", () => {
    it("should return undefined when ttlMs is undefined", () => {
      const createdAt = new Date("2024-01-15T10:00:00Z");
      expect(calculateExpirationDate(createdAt, undefined)).toBeUndefined();
    });

    it("should return undefined when ttlMs is 0", () => {
      const createdAt = new Date("2024-01-15T10:00:00Z");
      expect(calculateExpirationDate(createdAt, 0)).toBeUndefined();
    });

    it("should return undefined when ttlMs is negative", () => {
      const createdAt = new Date("2024-01-15T10:00:00Z");
      expect(calculateExpirationDate(createdAt, -1000)).toBeUndefined();
    });

    it("should calculate correct expiration date", () => {
      const createdAt = new Date("2024-01-15T10:00:00Z");
      const ttlMs = 3600000; // 1 hour
      const expectedExpiration = new Date("2024-01-15T11:00:00Z");

      expect(calculateExpirationDate(createdAt, ttlMs)).toEqual(
        expectedExpiration,
      );
    });

    it("should calculate expiration for 7 days TTL", () => {
      const createdAt = new Date("2024-01-15T10:00:00Z");
      const ttlMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      const expectedExpiration = new Date("2024-01-22T10:00:00Z");

      expect(calculateExpirationDate(createdAt, ttlMs)).toEqual(
        expectedExpiration,
      );
    });
  });

  describe("DEFAULT_RETRY_POLICY", () => {
    it("should have expected default values", () => {
      expect(DEFAULT_RETRY_POLICY.enabled).toBe(true);
      expect(DEFAULT_RETRY_POLICY.maxRetries).toBe(3);
      expect(DEFAULT_RETRY_POLICY.backoff.type).toBe("exponential");
      expect(DEFAULT_RETRY_POLICY.ttlMs).toBe(604800000); // 7 days
    });

    it("should have exponential backoff with jitter", () => {
      const backoff = DEFAULT_RETRY_POLICY.backoff;
      if (backoff.type === "exponential") {
        expect(backoff.initialDelayMs).toBe(1000);
        expect(backoff.maxDelayMs).toBe(300000);
        expect(backoff.multiplier).toBe(2);
        expect(backoff.jitter).toBe(true);
      } else {
        throw new Error("Expected exponential backoff");
      }
    });

    it("should not have retryableErrors or nonRetryableErrors by default", () => {
      expect(DEFAULT_RETRY_POLICY.retryableErrors).toBeUndefined();
      expect(DEFAULT_RETRY_POLICY.nonRetryableErrors).toBeUndefined();
    });
  });
});
