import { Stream } from "effect";
import { UploadistaError } from "../errors";

export function convertToStream<T>(data: ReadableStream<T>) {
  return Stream.fromReadableStream(
    () => data,
    (error) =>
      new UploadistaError({
        code: "UNKNOWN_ERROR",
        status: 500,
        body: String(error),
      }),
  );
}
