import { describe, expect, it, vi } from "vitest";
import { permit, semaphore } from "./semaphore";

describe("permit", () => {
  it("should create a permit with release function", async () => {
    const onRelease = vi.fn().mockResolvedValue(undefined);
    const testPermit = permit(onRelease);

    expect(testPermit).toHaveProperty("release");
    expect(typeof testPermit.release).toBe("function");
    expect(onRelease).not.toHaveBeenCalled();
  });

  it("should call onRelease when permit is released", async () => {
    const onRelease = vi.fn().mockResolvedValue(undefined);
    const testPermit = permit(onRelease);

    await testPermit.release();

    expect(onRelease).toHaveBeenCalledOnce();
  });

  it("should not call onRelease multiple times", async () => {
    const onRelease = vi.fn().mockResolvedValue(undefined);
    const testPermit = permit(onRelease);

    await testPermit.release();
    await testPermit.release();
    await testPermit.release();

    expect(onRelease).toHaveBeenCalledOnce();
  });

  it("should handle async onRelease callback", async () => {
    const onRelease = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );
    const testPermit = permit(onRelease);

    const releasePromise = testPermit.release();
    expect(onRelease).toHaveBeenCalledOnce();

    await releasePromise;
    expect(onRelease).toHaveBeenCalledOnce();
  });
});

describe("semaphore", () => {
  it("should create a semaphore with acquire method", () => {
    const sem = semaphore(1);
    expect(sem).toHaveProperty("acquire");
    expect(typeof sem.acquire).toBe("function");
  });

  it("should allow acquiring permits up to the limit", async () => {
    const sem = semaphore(2);

    const permit1 = await sem.acquire();
    const permit2 = await sem.acquire();

    expect(permit1).toHaveProperty("release");
    expect(permit2).toHaveProperty("release");
  });

  it("should queue requests when semaphore is at capacity", async () => {
    const sem = semaphore(1);

    const permit1 = await sem.acquire();
    const permit2Promise = sem.acquire(); // This should be queued

    // permit2Promise should not resolve immediately
    let permit2Resolved = false;
    permit2Promise.then(() => {
      permit2Resolved = true;
    });

    // Give it a chance to resolve if it would
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(permit2Resolved).toBe(false);

    // Release the first permit
    await permit1.release();

    // Now permit2 should resolve
    const permit2 = await permit2Promise;
    expect(permit2).toHaveProperty("release");
  });

  it("should handle multiple queued requests", async () => {
    const sem = semaphore(1);

    const permit1 = await sem.acquire();
    const permit2Promise = sem.acquire();
    const permit3Promise = sem.acquire();
    const permit4Promise = sem.acquire();

    let resolvedCount = 0;
    permit2Promise.then(() => resolvedCount++);
    permit3Promise.then(() => resolvedCount++);
    permit4Promise.then(() => resolvedCount++);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolvedCount).toBe(0);

    // Release permits one by one
    await permit1.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolvedCount).toBe(1);

    const permit2 = await permit2Promise;
    await permit2.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolvedCount).toBe(2);

    const permit3 = await permit3Promise;
    await permit3.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolvedCount).toBe(3);

    const permit4 = await permit4Promise;
    await permit4.release();
  });

  it("should work correctly with multiple permits available", async () => {
    const sem = semaphore(3);

    const permits = await Promise.all([
      sem.acquire(),
      sem.acquire(),
      sem.acquire(),
    ]);

    expect(permits).toHaveLength(3);
    expect(permits.every((p) => "release" in p)).toBe(true);

    // Fourth request should be queued
    const permit4Promise = sem.acquire();
    let permit4Resolved = false;
    permit4Promise.then(() => {
      permit4Resolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(permit4Resolved).toBe(false);

    // Release one permit
    await permits[0].release();
    const permit4 = await permit4Promise;
    expect(permit4).toHaveProperty("release");
  });

  it("should handle zero capacity semaphore", async () => {
    const sem = semaphore(0);

    const permitPromise = sem.acquire();
    let permitResolved = false;
    permitPromise.then(() => {
      permitResolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(permitResolved).toBe(false);

    // This semaphore will never resolve unless permits are released elsewhere
    // which is not possible with 0 capacity, so this test verifies the queue works
  });

  it("should maintain FIFO order for queued requests", async () => {
    const sem = semaphore(1);
    const permit1 = await sem.acquire();

    const resolveOrder: number[] = [];
    const permit2Promise = sem.acquire().then((p) => {
      resolveOrder.push(2);
      return p;
    });
    const permit3Promise = sem.acquire().then((p) => {
      resolveOrder.push(3);
      return p;
    });
    const permit4Promise = sem.acquire().then((p) => {
      resolveOrder.push(4);
      return p;
    });

    await permit1.release();
    const permit2 = await permit2Promise;
    await permit2.release();
    const permit3 = await permit3Promise;
    await permit3.release();
    const permit4 = await permit4Promise;
    await permit4.release();

    expect(resolveOrder).toEqual([2, 3, 4]);
  });
});
