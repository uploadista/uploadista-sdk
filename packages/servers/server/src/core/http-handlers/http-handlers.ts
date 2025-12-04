import type { HealthCheckConfig } from "@uploadista/core/types";
import { Effect } from "effect";
import type { UploadistaRequest, UploadistaResponse } from "../routes";
import {
  handleDlqCleanup,
  handleDlqDelete,
  handleDlqGet,
  handleDlqList,
  handleDlqResolve,
  handleDlqRetry,
  handleDlqRetryAll,
  handleDlqStats,
} from "./dlq-http-handlers";
import {
  handleCancelFlow,
  handleGetFlow,
  handleJobStatus,
  handlePauseFlow,
  handleResumeFlow,
  handleRunFlow,
} from "./flow-http-handlers";
import {
  handleHealthComponents,
  handleHealthLiveness,
  handleHealthReadiness,
} from "./health-http-handlers";
import {
  handleCreateUpload,
  handleGetCapabilities,
  handleGetUpload,
  handleUploadChunk,
} from "./upload-http-handlers";

export type { UploadistaRequest, UploadistaResponse } from "../routes";

export const handleUploadistaRequest = <TRequirements>(
  req: UploadistaRequest,
  options?: { healthCheckConfig?: HealthCheckConfig },
) => {
  return Effect.gen(function* () {
    switch (req.type) {
      case "create-upload":
        return (yield* handleCreateUpload(req)) as UploadistaResponse;
      case "get-capabilities":
        return (yield* handleGetCapabilities(req)) as UploadistaResponse;
      case "get-upload":
        return (yield* handleGetUpload(req)) as UploadistaResponse;
      case "upload-chunk":
        return (yield* handleUploadChunk(req)) as UploadistaResponse;
      case "get-flow":
        return (yield* handleGetFlow(req)) as UploadistaResponse;
      case "run-flow":
        return (yield* handleRunFlow<TRequirements>(req)) as UploadistaResponse;
      case "job-status":
        return (yield* handleJobStatus(req)) as UploadistaResponse;
      case "resume-flow":
        return (yield* handleResumeFlow<TRequirements>(
          req,
        )) as UploadistaResponse;
      case "pause-flow":
        return (yield* handlePauseFlow(req)) as UploadistaResponse;
      case "cancel-flow":
        return (yield* handleCancelFlow(req)) as UploadistaResponse;
      // DLQ Admin routes
      case "dlq-list":
        return (yield* handleDlqList(req)) as UploadistaResponse;
      case "dlq-get":
        return (yield* handleDlqGet(req)) as UploadistaResponse;
      case "dlq-retry":
        return (yield* handleDlqRetry(req)) as UploadistaResponse;
      case "dlq-retry-all":
        return (yield* handleDlqRetryAll(req)) as UploadistaResponse;
      case "dlq-delete":
        return (yield* handleDlqDelete(req)) as UploadistaResponse;
      case "dlq-resolve":
        return (yield* handleDlqResolve(req)) as UploadistaResponse;
      case "dlq-cleanup":
        return (yield* handleDlqCleanup(req)) as UploadistaResponse;
      case "dlq-stats":
        return (yield* handleDlqStats(req)) as UploadistaResponse;
      // Health check routes
      case "health":
        return (yield* handleHealthLiveness(
          req,
          options?.healthCheckConfig,
        )) as UploadistaResponse;
      case "health-ready":
        return (yield* handleHealthReadiness(
          req,
          options?.healthCheckConfig,
        )) as UploadistaResponse;
      case "health-components":
        return (yield* handleHealthComponents(
          req,
          options?.healthCheckConfig,
        )) as UploadistaResponse;
      case "not-found":
        return {
          status: 404,
          headers: { "Content-Type": "application/json" },
          body: { error: "Not found" },
        } as UploadistaResponse;
      case "bad-request":
        return {
          status: 400,
          body: { error: "Bad request", message: req.message },
        } as UploadistaResponse;
      case "method-not-allowed":
        return {
          status: 405,
          headers: { "Content-Type": "application/json" },
          body: { error: "Method not allowed" },
        } as UploadistaResponse;
      case "unsupported-content-type":
        return {
          status: 415,
          headers: { "Content-Type": "application/json" },
          body: { error: "Unsupported content type" },
        } as UploadistaResponse;
    }
  });
};
