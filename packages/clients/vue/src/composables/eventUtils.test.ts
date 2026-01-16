import { describe, expect, it } from "vitest";
import { isFlowEvent, isUploadEvent } from "./eventUtils";

describe("eventUtils", () => {
  describe("isFlowEvent", () => {
    it("should return true for JobStart event", () => {
      const event = { eventType: "job-start", jobId: "job-1" };
      expect(isFlowEvent(event)).toBe(true);
    });

    it("should return true for JobEnd event", () => {
      const event = { eventType: "job-end", jobId: "job-1" };
      expect(isFlowEvent(event)).toBe(true);
    });

    it("should return true for FlowStart event", () => {
      const event = {
        eventType: "flow-start",
        jobId: "job-1",
        flowId: "flow-1",
      };
      expect(isFlowEvent(event)).toBe(true);
    });

    it("should return true for FlowEnd event", () => {
      const event = {
        eventType: "flow-end",
        jobId: "job-1",
        flowId: "flow-1",
      };
      expect(isFlowEvent(event)).toBe(true);
    });

    it("should return true for FlowError event", () => {
      const event = {
        eventType: "flow-error",
        jobId: "job-1",
        flowId: "flow-1",
        error: "Something went wrong",
      };
      expect(isFlowEvent(event)).toBe(true);
    });

    it("should return true for FlowPause event", () => {
      const event = {
        eventType: "flow-pause",
        jobId: "job-1",
        flowId: "flow-1",
      };
      expect(isFlowEvent(event)).toBe(true);
    });

    it("should return true for FlowCancel event", () => {
      const event = {
        eventType: "flow-cancel",
        jobId: "job-1",
        flowId: "flow-1",
      };
      expect(isFlowEvent(event)).toBe(true);
    });

    it("should return true for NodeStart event", () => {
      const event = {
        eventType: "node-start",
        jobId: "job-1",
        flowId: "flow-1",
        nodeId: "node-1",
        nodeName: "input-node",
        nodeType: "input",
      };
      expect(isFlowEvent(event)).toBe(true);
    });

    it("should return true for NodeEnd event", () => {
      const event = {
        eventType: "node-end",
        jobId: "job-1",
        flowId: "flow-1",
        nodeId: "node-1",
        nodeName: "input-node",
      };
      expect(isFlowEvent(event)).toBe(true);
    });

    it("should return true for NodePause event", () => {
      const event = {
        eventType: "node-pause",
        jobId: "job-1",
        flowId: "flow-1",
        nodeId: "node-1",
        nodeName: "input-node",
      };
      expect(isFlowEvent(event)).toBe(true);
    });

    it("should return true for NodeResume event", () => {
      const event = {
        eventType: "node-resume",
        jobId: "job-1",
        flowId: "flow-1",
        nodeId: "node-1",
        nodeName: "input-node",
        nodeType: "input",
      };
      expect(isFlowEvent(event)).toBe(true);
    });

    it("should return true for NodeError event", () => {
      const event = {
        eventType: "node-error",
        jobId: "job-1",
        flowId: "flow-1",
        nodeId: "node-1",
        nodeName: "input-node",
        error: "Node failed",
      };
      expect(isFlowEvent(event)).toBe(true);
    });

    it("should return true for NodeStream event", () => {
      const event = {
        eventType: "node-stream",
        jobId: "job-1",
        flowId: "flow-1",
        nodeId: "node-1",
      };
      expect(isFlowEvent(event)).toBe(true);
    });

    it("should return true for NodeResponse event", () => {
      const event = {
        eventType: "node-response",
        jobId: "job-1",
        flowId: "flow-1",
        nodeId: "node-1",
        nodeName: "input-node",
        data: {},
      };
      expect(isFlowEvent(event)).toBe(true);
    });

    it("should return false for upload events", () => {
      const event = {
        type: "upload-started",
        data: { id: "upload-1" },
      };
      expect(isFlowEvent(event)).toBe(false);
    });

    it("should return false for events without eventType", () => {
      const event = { type: "unknown" };
      expect(isFlowEvent(event)).toBe(false);
    });

    it("should return false for unknown eventType values", () => {
      const event = { eventType: "unknown-event" };
      expect(isFlowEvent(event)).toBe(false);
    });
  });

  describe("isUploadEvent", () => {
    it("should return true for UPLOAD_STARTED event", () => {
      const event = {
        type: "upload-started",
        data: { id: "upload-1", name: "test.txt", size: 100 },
      };
      expect(isUploadEvent(event)).toBe(true);
    });

    it("should return true for UPLOAD_PROGRESS event", () => {
      const event = {
        type: "upload-progress",
        data: { id: "upload-1", progress: 50, total: 100 },
      };
      expect(isUploadEvent(event)).toBe(true);
    });

    it("should return true for UPLOAD_COMPLETE event", () => {
      const event = {
        type: "upload-complete",
        data: { id: "upload-1", name: "test.txt", size: 100 },
      };
      expect(isUploadEvent(event)).toBe(true);
    });

    it("should return true for UPLOAD_FAILED event", () => {
      const event = {
        type: "upload-failed",
        data: { id: "upload-1", error: "Upload failed" },
      };
      expect(isUploadEvent(event)).toBe(true);
    });

    it("should return true for UPLOAD_VALIDATION_SUCCESS event", () => {
      const event = {
        type: "upload-validation-success",
        data: { id: "upload-1", validationType: "checksum" },
      };
      expect(isUploadEvent(event)).toBe(true);
    });

    it("should return true for UPLOAD_VALIDATION_FAILED event", () => {
      const event = {
        type: "upload-validation-failed",
        data: {
          id: "upload-1",
          reason: "Checksum mismatch",
          expected: "abc",
          actual: "def",
        },
      };
      expect(isUploadEvent(event)).toBe(true);
    });

    it("should return true for UPLOAD_VALIDATION_WARNING event", () => {
      const event = {
        type: "upload-validation-warning",
        data: { id: "upload-1", message: "Warning message" },
      };
      expect(isUploadEvent(event)).toBe(true);
    });

    it("should return false for flow events", () => {
      const event = {
        eventType: "flow-start",
        jobId: "job-1",
        flowId: "flow-1",
      };
      expect(isUploadEvent(event)).toBe(false);
    });

    it("should return false for events without type", () => {
      const event = { eventType: "flow-start" };
      expect(isUploadEvent(event)).toBe(false);
    });

    it("should return false for unknown type values", () => {
      const event = { type: "unknown-type" };
      expect(isUploadEvent(event)).toBe(false);
    });
  });

  describe("combined behavior", () => {
    it("should not classify the same event as both flow and upload", () => {
      const flowEvent = {
        eventType: "flow-start",
        jobId: "job-1",
        flowId: "flow-1",
      };
      const uploadEvent = {
        type: "upload-started",
        data: { id: "upload-1" },
      };

      expect(isFlowEvent(flowEvent)).toBe(true);
      expect(isUploadEvent(flowEvent)).toBe(false);

      expect(isUploadEvent(uploadEvent)).toBe(true);
      expect(isFlowEvent(uploadEvent)).toBe(false);
    });

    it("should return false for empty objects", () => {
      expect(isFlowEvent({})).toBe(false);
      expect(isUploadEvent({})).toBe(false);
    });
  });
});
