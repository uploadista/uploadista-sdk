import type { FlowJob } from "@uploadista/core/flow";
import type { UploadFile } from "@uploadista/core/types";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { makeCloudflareDoFlowStore } from "../src/cloudflare-do-flow-store";
import { makeCloudflareDoUploadStore } from "../src/cloudflare-do-upload-store";
import type {
  FlowJobDurableObject,
  FlowJobDurableObjectBranded,
} from "../src/flowjob-durable-object";
import type {
  UploadFileDurableObject,
  UploadFileDurableObjectBranded,
} from "../src/uploadfile-durable-object";

describe("Cloudflare Durable Objects KV Store", () => {
  describe("FlowJob Store - Basic Operations", () => {
    it("should store and retrieve flow jobs", async () => {
      const mockFlowJob: FlowJob = {
        id: "job1",
        flowId: "flow1",
        status: "running",
        tasks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockStub = {
        getFlowJob: vi.fn().mockResolvedValue(mockFlowJob),
        setFlowJob: vi.fn().mockResolvedValue(undefined),
        deleteFlowJob: vi.fn().mockResolvedValue(undefined),
        emit: vi.fn().mockResolvedValue(undefined),
      } as unknown as FlowJobDurableObjectBranded<FlowJob>;

      const mockDO = {
        idFromName: vi.fn().mockReturnValue("id1"),
        get: vi.fn().mockReturnValue(mockStub),
      } as unknown as FlowJobDurableObject<FlowJob>;

      const store = makeCloudflareDoFlowStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("job1", mockFlowJob);
          const retrieved = yield* store.get("job1");
          expect(retrieved).toEqual(mockFlowJob);
          expect(mockDO.idFromName).toHaveBeenCalledWith("job1");
          expect(mockStub.setFlowJob).toHaveBeenCalledWith(mockFlowJob);
        }),
      );
    });

    it("should fail when getting non-existent flow job", async () => {
      const mockStub = {
        getFlowJob: vi.fn().mockResolvedValue(undefined),
        setFlowJob: vi.fn(),
        deleteFlowJob: vi.fn(),
        emit: vi.fn(),
      } as unknown as FlowJobDurableObjectBranded<FlowJob>;

      const mockDO = {
        idFromName: vi.fn().mockReturnValue("id1"),
        get: vi.fn().mockReturnValue(mockStub),
      } as unknown as FlowJobDurableObject<FlowJob>;

      const store = makeCloudflareDoFlowStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.get("non-existent"));
          expect(result._tag).toBe("Left");
        }),
      );
    });

    it("should delete flow jobs", async () => {
      const mockStub = {
        getFlowJob: vi.fn().mockResolvedValue(undefined),
        setFlowJob: vi.fn().mockResolvedValue(undefined),
        deleteFlowJob: vi.fn().mockResolvedValue(undefined),
        emit: vi.fn(),
      } as unknown as FlowJobDurableObjectBranded<FlowJob>;

      const mockDO = {
        idFromName: vi.fn().mockReturnValue("id1"),
        get: vi.fn().mockReturnValue(mockStub),
      } as unknown as FlowJobDurableObject<FlowJob>;

      const store = makeCloudflareDoFlowStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.delete("job1");
          expect(mockStub.deleteFlowJob).toHaveBeenCalled();
        }),
      );
    });
  });

  describe("FlowJob Store - Complex Operations", () => {
    it("should handle flow job updates", async () => {
      const mockFlowJob1: FlowJob = {
        id: "job1",
        flowId: "flow1",
        status: "running",
        tasks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockFlowJob2: FlowJob = {
        ...mockFlowJob1,
        status: "completed",
      };

      const mockStub = {
        getFlowJob: vi.fn().mockResolvedValue(mockFlowJob2),
        setFlowJob: vi.fn().mockResolvedValue(undefined),
        deleteFlowJob: vi.fn(),
        emit: vi.fn(),
      } as unknown as FlowJobDurableObjectBranded<FlowJob>;

      const mockDO = {
        idFromName: vi.fn().mockReturnValue("id1"),
        get: vi.fn().mockReturnValue(mockStub),
      } as unknown as FlowJobDurableObject<FlowJob>;

      const store = makeCloudflareDoFlowStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("job1", mockFlowJob1);
          yield* store.set("job1", mockFlowJob2);
          const retrieved = yield* store.get("job1");
          expect(retrieved.status).toBe("completed");
          expect(mockStub.setFlowJob).toHaveBeenCalledTimes(2);
        }),
      );
    });

    it("should handle flow jobs with tasks", async () => {
      const mockFlowJob: FlowJob = {
        id: "job1",
        flowId: "flow1",
        status: "running",
        tasks: [
          { id: "task1", status: "completed" },
          { id: "task2", status: "running" },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockStub = {
        getFlowJob: vi.fn().mockResolvedValue(mockFlowJob),
        setFlowJob: vi.fn().mockResolvedValue(undefined),
        deleteFlowJob: vi.fn(),
        emit: vi.fn(),
      } as unknown as FlowJobDurableObjectBranded<FlowJob>;

      const mockDO = {
        idFromName: vi.fn().mockReturnValue("id1"),
        get: vi.fn().mockReturnValue(mockStub),
      } as unknown as FlowJobDurableObject<FlowJob>;

      const store = makeCloudflareDoFlowStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("job1", mockFlowJob);
          const retrieved = yield* store.get("job1");
          expect(retrieved.tasks).toHaveLength(2);
          expect(retrieved.tasks[0].id).toBe("task1");
        }),
      );
    });
  });

  describe("FlowJob Store - Error Handling", () => {
    it("should handle get errors", async () => {
      const mockStub = {
        getFlowJob: vi.fn().mockRejectedValue(new Error("Network error")),
        setFlowJob: vi.fn(),
        deleteFlowJob: vi.fn(),
        emit: vi.fn(),
      } as unknown as FlowJobDurableObjectBranded<FlowJob>;

      const mockDO = {
        idFromName: vi.fn().mockReturnValue("id1"),
        get: vi.fn().mockReturnValue(mockStub),
      } as unknown as FlowJobDurableObject<FlowJob>;

      const store = makeCloudflareDoFlowStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.get("job1"));
          expect(result._tag).toBe("Left");
        }),
      );
    });

    it("should handle set errors", async () => {
      const mockFlowJob: FlowJob = {
        id: "job1",
        flowId: "flow1",
        status: "running",
        tasks: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockStub = {
        getFlowJob: vi.fn(),
        setFlowJob: vi.fn().mockRejectedValue(new Error("Storage error")),
        deleteFlowJob: vi.fn(),
        emit: vi.fn(),
      } as unknown as FlowJobDurableObjectBranded<FlowJob>;

      const mockDO = {
        idFromName: vi.fn().mockReturnValue("id1"),
        get: vi.fn().mockReturnValue(mockStub),
      } as unknown as FlowJobDurableObject<FlowJob>;

      const store = makeCloudflareDoFlowStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.set("job1", mockFlowJob));
          expect(result._tag).toBe("Left");
        }),
      );
    });

    it("should handle delete errors", async () => {
      const mockStub = {
        getFlowJob: vi.fn(),
        setFlowJob: vi.fn(),
        deleteFlowJob: vi.fn().mockRejectedValue(new Error("Delete failed")),
        emit: vi.fn(),
      } as unknown as FlowJobDurableObjectBranded<FlowJob>;

      const mockDO = {
        idFromName: vi.fn().mockReturnValue("id1"),
        get: vi.fn().mockReturnValue(mockStub),
      } as unknown as FlowJobDurableObject<FlowJob>;

      const store = makeCloudflareDoFlowStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.delete("job1"));
          expect(result._tag).toBe("Left");
        }),
      );
    });
  });

  describe("FlowJob Store - Isolation", () => {
    it("should create separate stubs for different keys", async () => {
      const mockStub1 = {
        getFlowJob: vi.fn().mockResolvedValue({
          id: "job1",
          flowId: "flow1",
          status: "running",
          tasks: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        setFlowJob: vi.fn(),
        deleteFlowJob: vi.fn(),
        emit: vi.fn(),
      } as unknown as FlowJobDurableObjectBranded<FlowJob>;

      const mockStub2 = {
        getFlowJob: vi.fn().mockResolvedValue({
          id: "job2",
          flowId: "flow2",
          status: "completed",
          tasks: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        setFlowJob: vi.fn(),
        deleteFlowJob: vi.fn(),
        emit: vi.fn(),
      } as unknown as FlowJobDurableObjectBranded<FlowJob>;

      const mockDO = {
        idFromName: vi
          .fn()
          .mockReturnValueOnce("id1")
          .mockReturnValueOnce("id2"),
        get: vi.fn().mockReturnValueOnce(mockStub1).mockReturnValueOnce(mockStub2),
      } as unknown as FlowJobDurableObject<FlowJob>;

      const store = makeCloudflareDoFlowStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          const job1 = yield* store.get("job1");
          const job2 = yield* store.get("job2");

          expect(job1.id).toBe("job1");
          expect(job2.id).toBe("job2");
          expect(mockDO.idFromName).toHaveBeenCalledWith("job1");
          expect(mockDO.idFromName).toHaveBeenCalledWith("job2");
        }),
      );
    });
  });

  describe("UploadFile Store - Basic Operations", () => {
    it("should store and retrieve upload files", async () => {
      const mockUploadFile: UploadFile = {
        id: "file1",
        offset: 0,
        storage: { id: "s3", type: "s3" },
      };

      const mockStub = {
        getUploadFile: vi.fn().mockResolvedValue(mockUploadFile),
        setUploadFile: vi.fn().mockResolvedValue(undefined),
        deleteUploadFile: vi.fn().mockResolvedValue(undefined),
        emit: vi.fn().mockResolvedValue(undefined),
      } as unknown as UploadFileDurableObjectBranded<UploadFile>;

      const mockDO = {
        idFromName: vi.fn().mockReturnValue("id1"),
        get: vi.fn().mockReturnValue(mockStub),
      } as unknown as UploadFileDurableObject<UploadFile>;

      const store = makeCloudflareDoUploadStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("file1", mockUploadFile);
          const retrieved = yield* store.get("file1");
          expect(retrieved).toEqual(mockUploadFile);
          expect(mockDO.idFromName).toHaveBeenCalledWith("file1");
          expect(mockStub.setUploadFile).toHaveBeenCalledWith(mockUploadFile);
        }),
      );
    });

    it("should fail when getting non-existent upload file", async () => {
      const mockStub = {
        getUploadFile: vi.fn().mockResolvedValue(undefined),
        setUploadFile: vi.fn(),
        deleteUploadFile: vi.fn(),
        emit: vi.fn(),
      } as unknown as UploadFileDurableObjectBranded<UploadFile>;

      const mockDO = {
        idFromName: vi.fn().mockReturnValue("id1"),
        get: vi.fn().mockReturnValue(mockStub),
      } as unknown as UploadFileDurableObject<UploadFile>;

      const store = makeCloudflareDoUploadStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.get("non-existent"));
          expect(result._tag).toBe("Left");
        }),
      );
    });

    it("should delete upload files", async () => {
      const mockStub = {
        getUploadFile: vi.fn().mockResolvedValue(undefined),
        setUploadFile: vi.fn().mockResolvedValue(undefined),
        deleteUploadFile: vi.fn().mockResolvedValue(undefined),
        emit: vi.fn(),
      } as unknown as UploadFileDurableObjectBranded<UploadFile>;

      const mockDO = {
        idFromName: vi.fn().mockReturnValue("id1"),
        get: vi.fn().mockReturnValue(mockStub),
      } as unknown as UploadFileDurableObject<UploadFile>;

      const store = makeCloudflareDoUploadStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.delete("file1");
          expect(mockStub.deleteUploadFile).toHaveBeenCalled();
        }),
      );
    });
  });

  describe("UploadFile Store - Complex Operations", () => {
    it("should handle upload progress updates", async () => {
      const mockUploadFile1: UploadFile = {
        id: "file1",
        offset: 0,
        storage: { id: "s3", type: "s3" },
      };

      const mockUploadFile2: UploadFile = {
        ...mockUploadFile1,
        offset: 1024,
      };

      const mockStub = {
        getUploadFile: vi.fn().mockResolvedValue(mockUploadFile2),
        setUploadFile: vi.fn().mockResolvedValue(undefined),
        deleteUploadFile: vi.fn(),
        emit: vi.fn(),
      } as unknown as UploadFileDurableObjectBranded<UploadFile>;

      const mockDO = {
        idFromName: vi.fn().mockReturnValue("id1"),
        get: vi.fn().mockReturnValue(mockStub),
      } as unknown as UploadFileDurableObject<UploadFile>;

      const store = makeCloudflareDoUploadStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("file1", mockUploadFile1);
          yield* store.set("file1", mockUploadFile2);
          const retrieved = yield* store.get("file1");
          expect(retrieved.offset).toBe(1024);
          expect(mockStub.setUploadFile).toHaveBeenCalledTimes(2);
        }),
      );
    });

    it("should handle upload files with metadata", async () => {
      const mockUploadFile: UploadFile = {
        id: "file1",
        offset: 0,
        storage: { id: "s3", type: "s3" },
        size: 5000,
        metadata: {
          filename: "test.jpg",
          contentType: "image/jpeg",
        },
      };

      const mockStub = {
        getUploadFile: vi.fn().mockResolvedValue(mockUploadFile),
        setUploadFile: vi.fn().mockResolvedValue(undefined),
        deleteUploadFile: vi.fn(),
        emit: vi.fn(),
      } as unknown as UploadFileDurableObjectBranded<UploadFile>;

      const mockDO = {
        idFromName: vi.fn().mockReturnValue("id1"),
        get: vi.fn().mockReturnValue(mockStub),
      } as unknown as UploadFileDurableObject<UploadFile>;

      const store = makeCloudflareDoUploadStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("file1", mockUploadFile);
          const retrieved = yield* store.get("file1");
          expect(retrieved.metadata?.filename).toBe("test.jpg");
          expect(retrieved.size).toBe(5000);
        }),
      );
    });
  });

  describe("UploadFile Store - Error Handling", () => {
    it("should handle get errors", async () => {
      const mockStub = {
        getUploadFile: vi.fn().mockRejectedValue(new Error("Network error")),
        setUploadFile: vi.fn(),
        deleteUploadFile: vi.fn(),
        emit: vi.fn(),
      } as unknown as UploadFileDurableObjectBranded<UploadFile>;

      const mockDO = {
        idFromName: vi.fn().mockReturnValue("id1"),
        get: vi.fn().mockReturnValue(mockStub),
      } as unknown as UploadFileDurableObject<UploadFile>;

      const store = makeCloudflareDoUploadStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.get("file1"));
          expect(result._tag).toBe("Left");
        }),
      );
    });

    it("should handle set errors", async () => {
      const mockUploadFile: UploadFile = {
        id: "file1",
        offset: 0,
        storage: { id: "s3", type: "s3" },
      };

      const mockStub = {
        getUploadFile: vi.fn(),
        setUploadFile: vi.fn().mockRejectedValue(new Error("Storage error")),
        deleteUploadFile: vi.fn(),
        emit: vi.fn(),
      } as unknown as UploadFileDurableObjectBranded<UploadFile>;

      const mockDO = {
        idFromName: vi.fn().mockReturnValue("id1"),
        get: vi.fn().mockReturnValue(mockStub),
      } as unknown as UploadFileDurableObject<UploadFile>;

      const store = makeCloudflareDoUploadStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(
            store.set("file1", mockUploadFile),
          );
          expect(result._tag).toBe("Left");
        }),
      );
    });

    it("should handle delete errors", async () => {
      const mockStub = {
        getUploadFile: vi.fn(),
        setUploadFile: vi.fn(),
        deleteUploadFile: vi.fn().mockRejectedValue(new Error("Delete failed")),
        emit: vi.fn(),
      } as unknown as UploadFileDurableObjectBranded<UploadFile>;

      const mockDO = {
        idFromName: vi.fn().mockReturnValue("id1"),
        get: vi.fn().mockReturnValue(mockStub),
      } as unknown as UploadFileDurableObject<UploadFile>;

      const store = makeCloudflareDoUploadStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.delete("file1"));
          expect(result._tag).toBe("Left");
        }),
      );
    });
  });

  describe("UploadFile Store - Isolation", () => {
    it("should create separate stubs for different keys", async () => {
      const mockStub1 = {
        getUploadFile: vi.fn().mockResolvedValue({
          id: "file1",
          offset: 0,
          storage: { id: "s3", type: "s3" },
        }),
        setUploadFile: vi.fn(),
        deleteUploadFile: vi.fn(),
        emit: vi.fn(),
      } as unknown as UploadFileDurableObjectBranded<UploadFile>;

      const mockStub2 = {
        getUploadFile: vi.fn().mockResolvedValue({
          id: "file2",
          offset: 1024,
          storage: { id: "gcs", type: "gcs" },
        }),
        setUploadFile: vi.fn(),
        deleteUploadFile: vi.fn(),
        emit: vi.fn(),
      } as unknown as UploadFileDurableObjectBranded<UploadFile>;

      const mockDO = {
        idFromName: vi
          .fn()
          .mockReturnValueOnce("id1")
          .mockReturnValueOnce("id2"),
        get: vi.fn().mockReturnValueOnce(mockStub1).mockReturnValueOnce(mockStub2),
      } as unknown as UploadFileDurableObject<UploadFile>;

      const store = makeCloudflareDoUploadStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          const file1 = yield* store.get("file1");
          const file2 = yield* store.get("file2");

          expect(file1.id).toBe("file1");
          expect(file2.id).toBe("file2");
          expect(file1.storage.type).toBe("s3");
          expect(file2.storage.type).toBe("gcs");
          expect(mockDO.idFromName).toHaveBeenCalledWith("file1");
          expect(mockDO.idFromName).toHaveBeenCalledWith("file2");
        }),
      );
    });
  });

  describe("Durable Object Naming", () => {
    it("should generate consistent IDs from names", async () => {
      const mockStub = {
        getUploadFile: vi.fn().mockResolvedValue({
          id: "file1",
          offset: 0,
          storage: { id: "s3", type: "s3" },
        }),
        setUploadFile: vi.fn(),
        deleteUploadFile: vi.fn(),
        emit: vi.fn(),
      } as unknown as UploadFileDurableObjectBranded<UploadFile>;

      const mockDO = {
        idFromName: vi.fn().mockReturnValue("consistent-id"),
        get: vi.fn().mockReturnValue(mockStub),
      } as unknown as UploadFileDurableObject<UploadFile>;

      const store = makeCloudflareDoUploadStore({ durableObject: mockDO });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.get("file1");
          yield* store.get("file1");
          yield* store.get("file1");

          expect(mockDO.idFromName).toHaveBeenCalledTimes(3);
          expect(mockDO.idFromName).toHaveBeenCalledWith("file1");
        }),
      );
    });
  });
});
