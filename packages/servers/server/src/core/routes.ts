import type {
  DataStoreCapabilities,
  DeadLetterCleanupOptions,
  DeadLetterCleanupResult,
  DeadLetterItem,
  DeadLetterItemStatus,
  DeadLetterListOptions,
  DeadLetterQueueStats,
  FlowData,
  FlowJob,
  UploadFile,
} from "@uploadista/core";
import type { StandardResponse } from "../adapter/types";

export type UploadistaRouteType =
  | "create-upload"
  | "get-capabilities"
  | "get-upload"
  | "upload-chunk"
  | "get-flow"
  | "run-flow"
  | "job-status"
  | "resume-flow"
  | "pause-flow"
  | "cancel-flow"
  // DLQ Admin routes
  | "dlq-list"
  | "dlq-get"
  | "dlq-retry"
  | "dlq-retry-all"
  | "dlq-delete"
  | "dlq-resolve"
  | "dlq-cleanup"
  | "dlq-stats"
  // Error routes
  | "not-found"
  | "bad-request"
  | "method-not-allowed"
  | "unsupported-content-type";

export type UploadistaRoute<T extends UploadistaRouteType> = {
  type: T;
};

export type UploadistaStandardResponse<
  T extends UploadistaRouteType,
  ResponseBody,
  Status extends number = 200,
> = UploadistaRoute<T> & {
  status: Status;
  headers: { "Content-Type": "application/json" };
  body: ResponseBody;
};

export type NotFoundRequest = UploadistaRoute<"not-found">;

export type NotFoundResponse = UploadistaStandardResponse<
  "not-found",
  { error: "Not found" },
  404
>;

export type MethodNotAllowedRequest = UploadistaRoute<"method-not-allowed">;

export type MethodNotAllowedResponse = UploadistaStandardResponse<
  "method-not-allowed",
  { error: "Method not allowed" },
  405
>;

export type BadRequestRequest = UploadistaRoute<"bad-request"> & {
  message: string;
};

export type BadRequestResponse = UploadistaStandardResponse<
  "bad-request",
  { error: "Bad request"; message: string },
  400
>;

export type UnsupportedContentTypeRequest =
  UploadistaRoute<"unsupported-content-type">;

export type UnsupportedContentTypeResponse = UploadistaStandardResponse<
  "unsupported-content-type",
  { error: "Unsupported content type" },
  415
>;
export type CreateUploadRequest = UploadistaRoute<"create-upload"> & {
  data: unknown;
};
export type CreateUploadResponse = UploadistaStandardResponse<
  "create-upload",
  UploadFile
>;
export type GetCapabilitiesRequest = UploadistaRoute<"get-capabilities"> & {
  storageId: string;
};
export type GetCapabilitiesResponse = UploadistaStandardResponse<
  "get-capabilities",
  {
    storageId: string;
    capabilities: DataStoreCapabilities;
    timestamp: string;
  }
>;

export type GetUploadRequest = UploadistaRoute<"get-upload"> & {
  uploadId: string;
};

export type GetUploadResponse = UploadistaStandardResponse<
  "get-upload",
  UploadFile
>;

export type UploadChunkRequest = UploadistaRoute<"upload-chunk"> & {
  uploadId: string;
  data: ReadableStream;
};

export type UploadChunkResponse = UploadistaStandardResponse<
  "upload-chunk",
  UploadFile
>;

export type GetFlowRequest = UploadistaRoute<"get-flow"> & {
  flowId: string;
};
export type GetFlowResponse = UploadistaStandardResponse<"get-flow", FlowData>;

export type RunFlowRequest = UploadistaRoute<"run-flow"> & {
  flowId: string;
  storageId: string;
  inputs: Record<string, unknown>;
};
export type RunFlowResponse = UploadistaStandardResponse<"run-flow", FlowJob>;

export type GetJobStatusRequest = UploadistaRoute<"job-status"> & {
  jobId: string;
};
export type GetJobStatusResponse = UploadistaStandardResponse<
  "job-status",
  FlowJob
>;

export type ResumeFlowRequest = UploadistaRoute<"resume-flow"> & {
  jobId: string;
  nodeId: string;
  newData: unknown;
};
export type ResumeFlowResponse = UploadistaStandardResponse<
  "resume-flow",
  FlowJob
>;

export type PauseFlowRequest = UploadistaRoute<"pause-flow"> & {
  jobId: string;
};
export type PauseFlowResponse = UploadistaStandardResponse<
  "pause-flow",
  FlowJob
>;

export type CancelFlowRequest = UploadistaRoute<"cancel-flow"> & {
  jobId: string;
};
export type CancelFlowResponse = UploadistaStandardResponse<
  "cancel-flow",
  FlowJob
>;

// ============================================================================
// Dead Letter Queue Admin Routes
// ============================================================================

export type DlqListRequest = UploadistaRoute<"dlq-list"> & {
  options?: DeadLetterListOptions;
};
export type DlqListResponse = UploadistaStandardResponse<
  "dlq-list",
  { items: DeadLetterItem[]; total: number }
>;

export type DlqGetRequest = UploadistaRoute<"dlq-get"> & {
  itemId: string;
};
export type DlqGetResponse = UploadistaStandardResponse<"dlq-get", DeadLetterItem>;

export type DlqRetryRequest = UploadistaRoute<"dlq-retry"> & {
  itemId: string;
};
export type DlqRetryResponse = UploadistaStandardResponse<
  "dlq-retry",
  { success: boolean; newJobId?: string }
>;

export type DlqRetryAllRequest = UploadistaRoute<"dlq-retry-all"> & {
  options?: { status?: DeadLetterItemStatus; flowId?: string };
};
export type DlqRetryAllResponse = UploadistaStandardResponse<
  "dlq-retry-all",
  { retried: number; succeeded: number; failed: number }
>;

export type DlqDeleteRequest = UploadistaRoute<"dlq-delete"> & {
  itemId: string;
};
export type DlqDeleteResponse = UploadistaStandardResponse<
  "dlq-delete",
  { success: boolean }
>;

export type DlqResolveRequest = UploadistaRoute<"dlq-resolve"> & {
  itemId: string;
};
export type DlqResolveResponse = UploadistaStandardResponse<
  "dlq-resolve",
  DeadLetterItem
>;

export type DlqCleanupRequest = UploadistaRoute<"dlq-cleanup"> & {
  options?: DeadLetterCleanupOptions;
};
export type DlqCleanupResponse = UploadistaStandardResponse<
  "dlq-cleanup",
  DeadLetterCleanupResult
>;

export type DlqStatsRequest = UploadistaRoute<"dlq-stats">;
export type DlqStatsResponse = UploadistaStandardResponse<
  "dlq-stats",
  DeadLetterQueueStats
>;

export type UploadistaRequest =
  | CreateUploadRequest
  | GetCapabilitiesRequest
  | GetUploadRequest
  | UploadChunkRequest
  | GetFlowRequest
  | RunFlowRequest
  | GetJobStatusRequest
  | ResumeFlowRequest
  | PauseFlowRequest
  | CancelFlowRequest
  // DLQ Admin requests
  | DlqListRequest
  | DlqGetRequest
  | DlqRetryRequest
  | DlqRetryAllRequest
  | DlqDeleteRequest
  | DlqResolveRequest
  | DlqCleanupRequest
  | DlqStatsRequest
  // Error requests
  | NotFoundRequest
  | BadRequestRequest
  | MethodNotAllowedRequest
  | UnsupportedContentTypeRequest;

export type UploadistaResponse =
  | CreateUploadResponse
  | GetCapabilitiesResponse
  | GetUploadResponse
  | UploadChunkResponse
  | GetFlowResponse
  | RunFlowResponse
  | GetJobStatusResponse
  | ResumeFlowResponse
  | PauseFlowResponse
  | CancelFlowResponse
  // DLQ Admin responses
  | DlqListResponse
  | DlqGetResponse
  | DlqRetryResponse
  | DlqRetryAllResponse
  | DlqDeleteResponse
  | DlqResolveResponse
  | DlqCleanupResponse
  | DlqStatsResponse
  // Error responses
  | NotFoundResponse
  | BadRequestResponse
  | MethodNotAllowedResponse
  | UnsupportedContentTypeResponse
  | StandardResponse;
