import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOtlpMetricExporter,
  createOtlpTraceExporter,
  getOtlpEndpoint,
  getServiceName,
  isOtlpExportEnabled,
  parseOtlpHeaders,
  parseResourceAttributes,
} from "../../src/core/exporters.js";

describe("OTLP Exporter Configuration", () => {
  // Store original env vars to restore after tests
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save original values
    originalEnv.OTEL_EXPORTER_OTLP_ENDPOINT =
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    originalEnv.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT =
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    originalEnv.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT =
      process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
    originalEnv.OTEL_EXPORTER_OTLP_HEADERS =
      process.env.OTEL_EXPORTER_OTLP_HEADERS;
    originalEnv.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME;
    originalEnv.OTEL_RESOURCE_ATTRIBUTES = process.env.OTEL_RESOURCE_ATTRIBUTES;
    originalEnv.UPLOADISTA_OBSERVABILITY_ENABLED =
      process.env.UPLOADISTA_OBSERVABILITY_ENABLED;

    // Clear env vars for clean test state
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_HEADERS;
    delete process.env.OTEL_SERVICE_NAME;
    delete process.env.OTEL_RESOURCE_ATTRIBUTES;
    delete process.env.UPLOADISTA_OBSERVABILITY_ENABLED;
  });

  afterEach(() => {
    // Restore original values
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe("parseOtlpHeaders", () => {
    it("should return undefined when env var is not set", () => {
      expect(parseOtlpHeaders()).toBeUndefined();
    });

    it("should parse single header", () => {
      process.env.OTEL_EXPORTER_OTLP_HEADERS = "Authorization=Basic abc123";
      expect(parseOtlpHeaders()).toEqual({
        Authorization: "Basic abc123",
      });
    });

    it("should parse multiple headers", () => {
      process.env.OTEL_EXPORTER_OTLP_HEADERS =
        "Authorization=Bearer token,X-Custom=value";
      expect(parseOtlpHeaders()).toEqual({
        Authorization: "Bearer token",
        "X-Custom": "value",
      });
    });

    it("should handle headers with = in value", () => {
      process.env.OTEL_EXPORTER_OTLP_HEADERS = "Authorization=Basic a=b=c";
      expect(parseOtlpHeaders()).toEqual({
        Authorization: "Basic a=b=c",
      });
    });

    it("should trim whitespace", () => {
      process.env.OTEL_EXPORTER_OTLP_HEADERS =
        " Authorization = Bearer token , X-Custom = value ";
      expect(parseOtlpHeaders()).toEqual({
        Authorization: "Bearer token",
        "X-Custom": "value",
      });
    });
  });

  describe("getOtlpEndpoint", () => {
    it("should return default endpoint when no env vars set", () => {
      expect(getOtlpEndpoint("traces")).toBe("http://localhost:4318");
      expect(getOtlpEndpoint("metrics")).toBe("http://localhost:4318");
    });

    it("should use config endpoint when provided", () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://env-endpoint:4318";
      expect(getOtlpEndpoint("traces", "http://config-endpoint:4318")).toBe(
        "http://config-endpoint:4318",
      );
    });

    it("should use signal-specific endpoint over base endpoint", () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://base:4318";
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = "http://traces:4318";
      expect(getOtlpEndpoint("traces")).toBe("http://traces:4318");
    });

    it("should use base endpoint when signal-specific not set", () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://base:4318";
      expect(getOtlpEndpoint("traces")).toBe("http://base:4318");
      expect(getOtlpEndpoint("metrics")).toBe("http://base:4318");
    });

    it("should use metrics-specific endpoint", () => {
      process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT = "http://metrics:4318";
      expect(getOtlpEndpoint("metrics")).toBe("http://metrics:4318");
    });
  });

  describe("isOtlpExportEnabled", () => {
    it("should return true by default", () => {
      expect(isOtlpExportEnabled()).toBe(true);
    });

    it("should return true when set to true", () => {
      process.env.UPLOADISTA_OBSERVABILITY_ENABLED = "true";
      expect(isOtlpExportEnabled()).toBe(true);
    });

    it("should return false when set to false", () => {
      process.env.UPLOADISTA_OBSERVABILITY_ENABLED = "false";
      expect(isOtlpExportEnabled()).toBe(false);
    });

    it("should return false when set to FALSE (case insensitive)", () => {
      process.env.UPLOADISTA_OBSERVABILITY_ENABLED = "FALSE";
      expect(isOtlpExportEnabled()).toBe(false);
    });

    it("should return false when set to 0", () => {
      process.env.UPLOADISTA_OBSERVABILITY_ENABLED = "0";
      expect(isOtlpExportEnabled()).toBe(false);
    });

    it("should return true for any other value", () => {
      process.env.UPLOADISTA_OBSERVABILITY_ENABLED = "yes";
      expect(isOtlpExportEnabled()).toBe(true);
    });
  });

  describe("getServiceName", () => {
    it("should return default when env var not set", () => {
      expect(getServiceName()).toBe("uploadista");
      expect(getServiceName("custom-default")).toBe("custom-default");
    });

    it("should return env var value when set", () => {
      process.env.OTEL_SERVICE_NAME = "my-service";
      expect(getServiceName()).toBe("my-service");
      expect(getServiceName("custom-default")).toBe("my-service");
    });
  });

  describe("parseResourceAttributes", () => {
    it("should return empty object when env var not set", () => {
      expect(parseResourceAttributes()).toEqual({});
    });

    it("should parse single attribute", () => {
      process.env.OTEL_RESOURCE_ATTRIBUTES = "tenant.id=abc123";
      expect(parseResourceAttributes()).toEqual({
        "tenant.id": "abc123",
      });
    });

    it("should parse multiple attributes", () => {
      process.env.OTEL_RESOURCE_ATTRIBUTES =
        "tenant.id=abc123,deployment.environment=production";
      expect(parseResourceAttributes()).toEqual({
        "tenant.id": "abc123",
        "deployment.environment": "production",
      });
    });

    it("should handle values with = character", () => {
      process.env.OTEL_RESOURCE_ATTRIBUTES = "config=a=b=c";
      expect(parseResourceAttributes()).toEqual({
        config: "a=b=c",
      });
    });
  });

  describe("createOtlpTraceExporter", () => {
    it("should create exporter with default config", () => {
      const exporter = createOtlpTraceExporter();
      expect(exporter).toBeDefined();
    });

    it("should create exporter with custom endpoint", () => {
      const exporter = createOtlpTraceExporter({
        endpoint: "http://custom:4318",
      });
      expect(exporter).toBeDefined();
    });

    it("should create exporter with custom headers", () => {
      const exporter = createOtlpTraceExporter({
        headers: { Authorization: "Bearer token" },
      });
      expect(exporter).toBeDefined();
    });

    it("should create exporter with custom timeout", () => {
      const exporter = createOtlpTraceExporter({
        timeoutMillis: 10000,
      });
      expect(exporter).toBeDefined();
    });
  });

  describe("createOtlpMetricExporter", () => {
    it("should create exporter with default config", () => {
      const exporter = createOtlpMetricExporter();
      expect(exporter).toBeDefined();
    });

    it("should create exporter with custom endpoint", () => {
      const exporter = createOtlpMetricExporter({
        endpoint: "http://custom:4318",
      });
      expect(exporter).toBeDefined();
    });
  });
});
