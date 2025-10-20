export type UploadistaErrorName =
  | "UPLOAD_SIZE_NOT_SPECIFIED"
  | "NETWORK_ERROR"
  | "NETWORK_UNEXPECTED_RESPONSE"
  | "UPLOAD_CHUNK_FAILED"
  | "WRONG_UPLOAD_SIZE"
  | "UPLOAD_LOCKED"
  | "UPLOAD_NOT_FOUND"
  | "CREATE_UPLOAD_FAILED"
  | "DELETE_UPLOAD_FAILED"
  | "PARALLEL_SEGMENT_CREATION_FAILED"
  | "PARALLEL_SEGMENT_UPLOAD_FAILED"
  | "FLOW_NOT_FOUND"
  | "FLOW_INIT_FAILED"
  | "FLOW_RUN_FAILED"
  | "FLOW_CONTINUE_FAILED"
  | "FLOW_UNEXPECTED_STATE"
  | "FLOW_INCOMPATIBLE"
  | "FLOW_NO_UPLOAD_ID"
  | "FLOW_TIMEOUT"
  | "FLOW_FINALIZE_FAILED"
  | "JOB_NOT_FOUND"
  | "WEBSOCKET_AUTH_FAILED";

export class UploadistaError extends Error {
  name: UploadistaErrorName;
  message: string;
  cause: Error | undefined;
  status: number | undefined;

  constructor({
    name,
    message,
    cause,
    status,
  }: {
    name: UploadistaErrorName;
    message: string;
    cause?: Error;
    status?: number;
  }) {
    super();
    this.name = name;
    this.cause = cause;
    this.message = message;
    this.status = status;
  }

  isNetworkError(): boolean {
    return (
      this.name === "NETWORK_ERROR" ||
      this.name === "NETWORK_UNEXPECTED_RESPONSE"
    );
  }
}
