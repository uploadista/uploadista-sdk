import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalStorageService } from "./local-storage-service";

describe("createLocalStorageService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("should create a storage service", () => {
    const service = createLocalStorageService();
    expect(service).toBeDefined();
    expect(service.getItem).toBeDefined();
    expect(service.setItem).toBeDefined();
    expect(service.removeItem).toBeDefined();
    expect(service.findAll).toBeDefined();
    expect(service.find).toBeDefined();
  });

  describe("setItem", () => {
    it("should store a value", async () => {
      const service = createLocalStorageService();

      await service.setItem("key", "value");

      expect(localStorage.getItem("key")).toBe("value");
    });

    it("should overwrite existing value", async () => {
      const service = createLocalStorageService();

      await service.setItem("key", "value1");
      await service.setItem("key", "value2");

      expect(localStorage.getItem("key")).toBe("value2");
    });
  });

  describe("getItem", () => {
    it("should retrieve a stored value", async () => {
      const service = createLocalStorageService();
      localStorage.setItem("key", "value");

      const result = await service.getItem("key");

      expect(result).toBe("value");
    });

    it("should return null for non-existent key", async () => {
      const service = createLocalStorageService();

      const result = await service.getItem("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("removeItem", () => {
    it("should remove a stored value", async () => {
      const service = createLocalStorageService();
      localStorage.setItem("key", "value");

      await service.removeItem("key");

      expect(localStorage.getItem("key")).toBeNull();
    });

    it("should not throw for non-existent key", async () => {
      const service = createLocalStorageService();

      await expect(service.removeItem("nonexistent")).resolves.not.toThrow();
    });
  });

  describe("findAll", () => {
    it("should return all stored items", async () => {
      const service = createLocalStorageService();
      localStorage.setItem("key1", "value1");
      localStorage.setItem("key2", "value2");

      const result = await service.findAll();

      expect(result).toEqual({
        key1: "value1",
        key2: "value2",
      });
    });

    it("should return empty object when storage is empty", async () => {
      const service = createLocalStorageService();

      const result = await service.findAll();

      expect(result).toEqual({});
    });
  });

  describe("find", () => {
    it("should return items matching prefix", async () => {
      const service = createLocalStorageService();
      localStorage.setItem("upload:1", "data1");
      localStorage.setItem("upload:2", "data2");
      localStorage.setItem("other:1", "other");

      const result = await service.find("upload:");

      expect(result).toEqual({
        "upload:1": "data1",
        "upload:2": "data2",
      });
    });

    it("should return empty object when no matches", async () => {
      const service = createLocalStorageService();
      localStorage.setItem("key", "value");

      const result = await service.find("nonexistent:");

      expect(result).toEqual({});
    });

    it("should return all items with empty prefix", async () => {
      const service = createLocalStorageService();
      localStorage.setItem("key1", "value1");
      localStorage.setItem("key2", "value2");

      const result = await service.find("");

      expect(result).toEqual({
        key1: "value1",
        key2: "value2",
      });
    });
  });

  describe("integration", () => {
    it("should handle JSON data", async () => {
      const service = createLocalStorageService();
      const data = { name: "test", count: 42, items: [1, 2, 3] };

      await service.setItem("json-key", JSON.stringify(data));
      const retrieved = await service.getItem("json-key");

      expect(JSON.parse(retrieved!)).toEqual(data);
    });

    it("should handle multiple operations", async () => {
      const service = createLocalStorageService();

      await service.setItem("a", "1");
      await service.setItem("b", "2");
      await service.setItem("c", "3");

      expect(await service.getItem("a")).toBe("1");
      expect(await service.getItem("b")).toBe("2");
      expect(await service.getItem("c")).toBe("3");

      await service.removeItem("b");

      const all = await service.findAll();
      expect(Object.keys(all)).toHaveLength(2);
      expect(all.b).toBeUndefined();
    });
  });
});
