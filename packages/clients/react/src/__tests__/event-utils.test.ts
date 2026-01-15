import { describe, expect, it } from "vitest";
import { isFlowEvent, isUploadEvent } from "../hooks/event-utils";

describe("event-utils", () => {
  describe("isFlowEvent", () => {
    it("should return true for job-start event", () => {
      const event = { eventType: "job-start" };
      expect(isFlowEvent(event as any)).toBe(true);
    });

    it("should return true for job-end event", () => {
      const event = { eventType: "job-end" };
      expect(isFlowEvent(event as any)).toBe(true);
    });

    it("should return true for flow-start event", () => {
      const event = { eventType: "flow-start" };
      expect(isFlowEvent(event as any)).toBe(true);
    });

    it("should return true for flow-end event", () => {
      const event = { eventType: "flow-end" };
      expect(isFlowEvent(event as any)).toBe(true);
    });

    it("should return true for flow-error event", () => {
      const event = { eventType: "flow-error" };
      expect(isFlowEvent(event as any)).toBe(true);
    });

    it("should return true for flow-pause event", () => {
      const event = { eventType: "flow-pause" };
      expect(isFlowEvent(event as any)).toBe(true);
    });

    it("should return true for flow-cancel event", () => {
      const event = { eventType: "flow-cancel" };
      expect(isFlowEvent(event as any)).toBe(true);
    });

    it("should return true for node-start event", () => {
      const event = { eventType: "node-start" };
      expect(isFlowEvent(event as any)).toBe(true);
    });

    it("should return true for node-end event", () => {
      const event = { eventType: "node-end" };
      expect(isFlowEvent(event as any)).toBe(true);
    });

    it("should return true for node-pause event", () => {
      const event = { eventType: "node-pause" };
      expect(isFlowEvent(event as any)).toBe(true);
    });

    it("should return true for node-resume event", () => {
      const event = { eventType: "node-resume" };
      expect(isFlowEvent(event as any)).toBe(true);
    });

    it("should return true for node-error event", () => {
      const event = { eventType: "node-error" };
      expect(isFlowEvent(event as any)).toBe(true);
    });

    it("should return true for node-stream event", () => {
      const event = { eventType: "node-stream" };
      expect(isFlowEvent(event as any)).toBe(true);
    });

    it("should return true for node-response event", () => {
      const event = { eventType: "node-response" };
      expect(isFlowEvent(event as any)).toBe(true);
    });

    it("should return false for upload events", () => {
      const event = { type: "upload-started" };
      expect(isFlowEvent(event as any)).toBe(false);
    });

    it("should return false for events without eventType", () => {
      const event = { someOtherProperty: "value" };
      expect(isFlowEvent(event as any)).toBe(false);
    });

    it("should return false for events with unknown eventType", () => {
      const event = { eventType: "unknown-event" };
      expect(isFlowEvent(event as any)).toBe(false);
    });

    it("should return false for empty object", () => {
      expect(isFlowEvent({} as any)).toBe(false);
    });
  });

  describe("isUploadEvent", () => {
    it("should return true for upload-started event", () => {
      const event = { type: "upload-started" };
      expect(isUploadEvent(event as any)).toBe(true);
    });

    it("should return true for upload-progress event", () => {
      const event = { type: "upload-progress" };
      expect(isUploadEvent(event as any)).toBe(true);
    });

    it("should return true for upload-complete event", () => {
      const event = { type: "upload-complete" };
      expect(isUploadEvent(event as any)).toBe(true);
    });

    it("should return true for upload-failed event", () => {
      const event = { type: "upload-failed" };
      expect(isUploadEvent(event as any)).toBe(true);
    });

    it("should return true for upload-validation-success event", () => {
      const event = { type: "upload-validation-success" };
      expect(isUploadEvent(event as any)).toBe(true);
    });

    it("should return true for upload-validation-failed event", () => {
      const event = { type: "upload-validation-failed" };
      expect(isUploadEvent(event as any)).toBe(true);
    });

    it("should return true for upload-validation-warning event", () => {
      const event = { type: "upload-validation-warning" };
      expect(isUploadEvent(event as any)).toBe(true);
    });

    it("should return false for flow events", () => {
      const event = { eventType: "flow-start" };
      expect(isUploadEvent(event as any)).toBe(false);
    });

    it("should return false for events without type property", () => {
      const event = { eventType: "upload-started" };
      expect(isUploadEvent(event as any)).toBe(false);
    });

    it("should return false for events with unknown type", () => {
      const event = { type: "unknown-event" };
      expect(isUploadEvent(event as any)).toBe(false);
    });

    it("should return false for empty object", () => {
      expect(isUploadEvent({} as any)).toBe(false);
    });
  });

  describe("mutually exclusive events", () => {
    it("should only match isFlowEvent for flow events", () => {
      const flowEvents = [
        { eventType: "job-start" },
        { eventType: "flow-start" },
        { eventType: "node-start" },
      ];

      for (const event of flowEvents) {
        expect(isFlowEvent(event as any)).toBe(true);
        expect(isUploadEvent(event as any)).toBe(false);
      }
    });

    it("should only match isUploadEvent for upload events", () => {
      const uploadEvents = [
        { type: "upload-started" },
        { type: "upload-progress" },
        { type: "upload-complete" },
      ];

      for (const event of uploadEvents) {
        expect(isUploadEvent(event as any)).toBe(true);
        expect(isFlowEvent(event as any)).toBe(false);
      }
    });
  });
});
