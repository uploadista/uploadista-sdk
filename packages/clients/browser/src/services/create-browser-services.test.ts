import { describe, expect, it } from "vitest";
import {
  type BrowserServiceOptions,
  createBrowserServices,
} from "./create-browser-services";

describe("createBrowserServices", () => {
  it("should create a service container with default options", () => {
    const services = createBrowserServices();

    expect(services).toBeDefined();
    expect(services.platform).toBeDefined();
    expect(services.storage).toBeDefined();
    expect(services.idGeneration).toBeDefined();
    expect(services.httpClient).toBeDefined();
    expect(services.fileReader).toBeDefined();
    expect(services.websocket).toBeDefined();
    expect(services.abortController).toBeDefined();
    expect(services.checksumService).toBeDefined();
    expect(services.fingerprintService).toBeDefined();
  });

  it("should create a service container with custom options", () => {
    const options: BrowserServiceOptions = {
      useLocalStorage: true,
      connectionPooling: {
        maxConnectionsPerHost: 10,
        connectionTimeout: 60000,
        keepAliveTimeout: 120000,
        enableHttp2: true,
        retryOnConnectionError: true,
      },
    };

    const services = createBrowserServices(options);

    expect(services).toBeDefined();
    expect(services.platform).toBeDefined();
    expect(services.storage).toBeDefined();
  });

  it("should use localStorage when useLocalStorage is true", () => {
    const services = createBrowserServices({ useLocalStorage: true });

    // Verify storage service is created
    expect(services.storage).toBeDefined();
    expect(services.storage.getItem).toBeDefined();
    expect(services.storage.setItem).toBeDefined();
    expect(services.storage.removeItem).toBeDefined();
    expect(services.storage.find).toBeDefined();
    expect(services.storage.findAll).toBeDefined();
  });

  it("should use localStorage as default when useLocalStorage is false", () => {
    // Currently the implementation uses localStorage as fallback
    const services = createBrowserServices({ useLocalStorage: false });

    expect(services.storage).toBeDefined();
    expect(services.storage.getItem).toBeDefined();
  });

  describe("platform service", () => {
    it("should have all platform service methods", () => {
      const services = createBrowserServices();
      const platform = services.platform;

      expect(platform.setTimeout).toBeDefined();
      expect(platform.clearTimeout).toBeDefined();
      expect(platform.isBrowser).toBeDefined();
      expect(platform.isOnline).toBeDefined();
      expect(platform.isFileLike).toBeDefined();
      expect(platform.getFileName).toBeDefined();
      expect(platform.getFileType).toBeDefined();
      expect(platform.getFileSize).toBeDefined();
      expect(platform.getFileLastModified).toBeDefined();
    });
  });

  describe("storage service", () => {
    it("should have all storage service methods", () => {
      const services = createBrowserServices();
      const storage = services.storage;

      expect(typeof storage.getItem).toBe("function");
      expect(typeof storage.setItem).toBe("function");
      expect(typeof storage.removeItem).toBe("function");
      expect(typeof storage.find).toBe("function");
      expect(typeof storage.findAll).toBe("function");
    });
  });

  describe("idGeneration service", () => {
    it("should generate unique IDs", () => {
      const services = createBrowserServices();
      const id1 = services.idGeneration.generate();
      const id2 = services.idGeneration.generate();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });
  });

  describe("httpClient", () => {
    it("should have all HTTP client methods", () => {
      const services = createBrowserServices();
      const httpClient = services.httpClient;

      expect(httpClient.request).toBeDefined();
      expect(httpClient.getMetrics).toBeDefined();
      expect(httpClient.getDetailedMetrics).toBeDefined();
      expect(httpClient.warmupConnections).toBeDefined();
      expect(httpClient.reset).toBeDefined();
      expect(httpClient.close).toBeDefined();
    });
  });

  describe("fileReader service", () => {
    it("should have openFile method", () => {
      const services = createBrowserServices();
      const fileReader = services.fileReader;

      expect(fileReader.openFile).toBeDefined();
      expect(typeof fileReader.openFile).toBe("function");
    });

    it("should open a file", async () => {
      const services = createBrowserServices();
      const file = new File(["test content"], "test.txt", {
        type: "text/plain",
      });

      const source = await services.fileReader.openFile(file, 1024);

      expect(source).toBeDefined();
      expect(source.size).toBe(file.size);
      expect(source.name).toBe("test.txt");
    });
  });

  describe("websocket factory", () => {
    it("should have create method", () => {
      const services = createBrowserServices();
      const websocket = services.websocket;

      expect(websocket.create).toBeDefined();
      expect(typeof websocket.create).toBe("function");
    });
  });

  describe("abortController factory", () => {
    it("should have create method", () => {
      const services = createBrowserServices();
      const abortController = services.abortController;

      expect(abortController.create).toBeDefined();
      expect(typeof abortController.create).toBe("function");
    });

    it("should create working abort controllers", () => {
      const services = createBrowserServices();
      const controller = services.abortController.create();

      expect(controller.signal.aborted).toBe(false);
      controller.abort();
      expect(controller.signal.aborted).toBe(true);
    });
  });

  describe("checksumService", () => {
    it("should compute checksums", async () => {
      const services = createBrowserServices();
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      const checksum = await services.checksumService.computeChecksum(data);

      expect(checksum).toBeDefined();
      expect(checksum).toHaveLength(64);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("fingerprintService", () => {
    it("should compute fingerprints", async () => {
      const services = createBrowserServices();
      const file = new File(["test content"], "test.txt", {
        type: "text/plain",
      });

      const fingerprint = await services.fingerprintService.computeFingerprint(
        file,
        "https://api.example.com",
      );

      expect(fingerprint).toBeDefined();
      expect(fingerprint).toHaveLength(64);
      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("integration", () => {
    it("should work together for a typical upload workflow", async () => {
      const services = createBrowserServices();

      // 1. Check if we're in browser
      expect(services.platform.isBrowser()).toBe(true);

      // 2. Generate an upload ID
      const uploadId = services.idGeneration.generate();
      expect(uploadId).toMatch(/^[0-9a-f-]{36}$/i);

      // 3. Create a file and open it
      const file = new File(["test file content"], "upload.txt", {
        type: "text/plain",
      });
      const source = await services.fileReader.openFile(file, 1024);
      expect(source.size).toBe(file.size);

      // 4. Compute fingerprint for deduplication
      const fingerprint = await services.fingerprintService.computeFingerprint(
        file,
        "https://api.example.com",
      );
      expect(fingerprint).toHaveLength(64);

      // 5. Create an abort controller for cancellation
      const controller = services.abortController.create();
      expect(controller.signal.aborted).toBe(false);

      // 6. Store upload state
      await services.storage.setItem(
        `upload:${uploadId}`,
        JSON.stringify({
          id: uploadId,
          fingerprint,
          status: "pending",
        }),
      );

      // 7. Retrieve stored state
      const storedState = await services.storage.getItem(`upload:${uploadId}`);
      expect(storedState).toBeDefined();
      expect(JSON.parse(storedState!).id).toBe(uploadId);

      // 8. Clean up
      await services.storage.removeItem(`upload:${uploadId}`);
      const removed = await services.storage.getItem(`upload:${uploadId}`);
      expect(removed).toBeNull();
    });
  });
});
