import "@testing-library/jest-dom/vitest";

// Mock the uploadista client-browser module
vi.mock("@uploadista/client-browser", () => ({
  createUploadistaClient: vi.fn(() => ({
    upload: vi.fn(),
    executeFlow: vi.fn(),
    discoverFlowInputs: vi.fn(),
    getChunkingInsights: vi.fn(() => ({
      currentChunkSize: 1024 * 1024,
      recommendedChunkSize: 1024 * 1024,
      networkCondition: "good",
    })),
    exportMetrics: vi.fn(() => ({})),
    getNetworkMetrics: vi.fn(() => ({
      averageSpeed: 1024 * 1024,
      currentSpeed: 1024 * 1024,
      estimatedTimeRemaining: 0,
    })),
    getNetworkCondition: vi.fn(() => "good"),
    resetMetrics: vi.fn(),
  })),
}));

// Mock UploadManager from client-core
vi.mock("@uploadista/client-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@uploadista/client-core")>();
  return {
    ...actual,
    UploadManager: vi.fn().mockImplementation(() => ({
      upload: vi.fn(),
      abort: vi.fn(),
      reset: vi.fn(),
      retry: vi.fn(),
      cleanup: vi.fn(),
      canRetry: vi.fn(() => false),
    })),
  };
});
