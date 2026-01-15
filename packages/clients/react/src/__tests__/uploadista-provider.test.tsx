import { render, screen, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  UploadistaProvider,
  useUploadistaContext,
} from "../components/uploadista-provider";

// Mock dependencies
vi.mock("@uploadista/client-browser", () => ({
  createUploadistaClient: vi.fn(() => ({
    upload: vi.fn(),
    executeFlow: vi.fn(),
    discoverFlowInputs: vi.fn(),
    uploadWithFlow: vi.fn(),
    multiInputFlowUpload: vi.fn(),
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

vi.mock("@uploadista/client-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@uploadista/client-core")>();
  return {
    ...actual,
    FlowManager: vi.fn().mockImplementation(() => ({
      handleFlowEvent: vi.fn(),
      handleUploadProgress: vi.fn(),
      cleanup: vi.fn(),
    })),
  };
});

describe("UploadistaProvider", () => {
  describe("context provision", () => {
    it("should render children", () => {
      render(
        <UploadistaProvider baseUrl="https://api.example.com" storageId="test">
          <div data-testid="child">Child content</div>
        </UploadistaProvider>,
      );

      expect(screen.getByTestId("child")).toHaveTextContent("Child content");
    });

    it("should provide context to children", () => {
      const TestComponent = () => {
        const context = useUploadistaContext();
        return (
          <div data-testid="result">
            {context.client ? "has-client" : "no-client"}
          </div>
        );
      };

      render(
        <UploadistaProvider baseUrl="https://api.example.com" storageId="test">
          <TestComponent />
        </UploadistaProvider>,
      );

      expect(screen.getByTestId("result")).toHaveTextContent("has-client");
    });

    it("should provide client and config through context", () => {
      const TestComponent = () => {
        const { client, config } = useUploadistaContext();
        return (
          <div>
            <div data-testid="client">{client ? "present" : "missing"}</div>
            <div data-testid="baseUrl">{config.baseUrl}</div>
            <div data-testid="storageId">{config.storageId}</div>
          </div>
        );
      };

      render(
        <UploadistaProvider
          baseUrl="https://api.example.com"
          storageId="my-storage"
        >
          <TestComponent />
        </UploadistaProvider>,
      );

      expect(screen.getByTestId("client")).toHaveTextContent("present");
      expect(screen.getByTestId("baseUrl")).toHaveTextContent(
        "https://api.example.com",
      );
      expect(screen.getByTestId("storageId")).toHaveTextContent("my-storage");
    });
  });

  describe("useUploadistaContext", () => {
    it("should throw error when used outside provider", () => {
      const TestComponent = () => {
        useUploadistaContext();
        return null;
      };

      expect(() => {
        render(<TestComponent />);
      }).toThrow(
        "useUploadistaContext must be used within an UploadistaProvider",
      );
    });

    it("should return context value when used within provider", () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <UploadistaProvider baseUrl="https://api.example.com" storageId="test">
          {children}
        </UploadistaProvider>
      );

      const { result } = renderHook(() => useUploadistaContext(), { wrapper });

      expect(result.current.client).toBeDefined();
      expect(result.current.config).toBeDefined();
      expect(result.current.subscribeToEvents).toBeDefined();
      expect(typeof result.current.subscribeToEvents).toBe("function");
    });
  });

  describe("event subscription", () => {
    it("should provide subscribeToEvents function", () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <UploadistaProvider baseUrl="https://api.example.com" storageId="test">
          {children}
        </UploadistaProvider>
      );

      const { result } = renderHook(() => useUploadistaContext(), { wrapper });

      expect(typeof result.current.subscribeToEvents).toBe("function");
    });

    it("should allow subscribing to events", () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <UploadistaProvider baseUrl="https://api.example.com" storageId="test">
          {children}
        </UploadistaProvider>
      );

      const { result } = renderHook(() => useUploadistaContext(), { wrapper });

      const handler = vi.fn();
      const unsubscribe = result.current.subscribeToEvents(handler);

      expect(typeof unsubscribe).toBe("function");
    });

    it("should return unsubscribe function from subscribeToEvents", () => {
      const wrapper = ({ children }: { children: ReactNode }) => (
        <UploadistaProvider baseUrl="https://api.example.com" storageId="test">
          {children}
        </UploadistaProvider>
      );

      const { result } = renderHook(() => useUploadistaContext(), { wrapper });

      const handler = vi.fn();
      const unsubscribe = result.current.subscribeToEvents(handler);

      // Should not throw when called
      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe("options passthrough", () => {
    it("should pass all options to the client", () => {
      const TestComponent = () => {
        const { config } = useUploadistaContext();
        return (
          <div>
            <div data-testid="chunkSize">{config.chunkSize}</div>
            <div data-testid="parallelUploads">{config.parallelUploads}</div>
          </div>
        );
      };

      render(
        <UploadistaProvider
          baseUrl="https://api.example.com"
          storageId="test"
          chunkSize={2 * 1024 * 1024}
          parallelUploads={4}
        >
          <TestComponent />
        </UploadistaProvider>,
      );

      expect(screen.getByTestId("chunkSize")).toHaveTextContent(
        String(2 * 1024 * 1024),
      );
      expect(screen.getByTestId("parallelUploads")).toHaveTextContent("4");
    });
  });

  describe("nested providers", () => {
    it("should allow nested providers with different configs", () => {
      const TestComponent = ({ testId }: { testId: string }) => {
        const { config } = useUploadistaContext();
        return <div data-testid={testId}>{config.storageId}</div>;
      };

      render(
        <UploadistaProvider
          baseUrl="https://api.example.com"
          storageId="outer-storage"
        >
          <TestComponent testId="outer" />
          <UploadistaProvider
            baseUrl="https://api.example.com"
            storageId="inner-storage"
          >
            <TestComponent testId="inner" />
          </UploadistaProvider>
        </UploadistaProvider>,
      );

      expect(screen.getByTestId("outer")).toHaveTextContent("outer-storage");
      expect(screen.getByTestId("inner")).toHaveTextContent("inner-storage");
    });
  });

  describe("context stability", () => {
    it("should maintain stable context value reference", async () => {
      let contextValues: any[] = [];

      const TestComponent = () => {
        const context = useUploadistaContext();
        contextValues.push(context);
        return null;
      };

      const { rerender } = render(
        <UploadistaProvider baseUrl="https://api.example.com" storageId="test">
          <TestComponent />
        </UploadistaProvider>,
      );

      // Re-render with same props
      rerender(
        <UploadistaProvider baseUrl="https://api.example.com" storageId="test">
          <TestComponent />
        </UploadistaProvider>,
      );

      await waitFor(() => {
        expect(contextValues.length).toBe(2);
      });

      // Both context values should have the same client reference
      expect(contextValues[0].client).toBe(contextValues[1].client);
    });
  });
});
