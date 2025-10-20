/**
 * Stream adapter utility to handle AWS SDK Body responses across different environments.
 *
 * In Node.js environments, AWS SDK returns Node.js Readable streams.
 * In Cloudflare Workers, it returns Web Streams API ReadableStreams.
 * This utility normalizes both to Web Streams API ReadableStreams.
 */

/**
 * Converts various stream types to a Web Streams API ReadableStream
 * @param body The body from AWS SDK response (could be Node.js Readable or Web ReadableStream)
 * @returns A Web Streams API ReadableStream
 */
export function toReadableStream(body: unknown): ReadableStream {
  // If it's already a Web ReadableStream, return as-is
  if (body instanceof ReadableStream) {
    return body;
  }

  // If it has a getReader method, it's likely already a ReadableStream
  if (body && typeof body === "object" && "getReader" in body) {
    return body as ReadableStream;
  }

  // Check if it's a Node.js Readable stream
  if (body && typeof body === "object" && "pipe" in body && "on" in body) {
    const nodeStream = body as NodeJS.ReadableStream;

    return new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk) => {
          controller.enqueue(new Uint8Array(chunk));
        });

        nodeStream.on("end", () => {
          controller.close();
        });

        nodeStream.on("error", (error) => {
          controller.error(error);
        });
      },
    });
  }

  // If it's some other type, try to handle it gracefully
  throw new Error(
    `Unsupported body type: ${typeof body}. Expected ReadableStream or Node.js Readable.`,
  );
}
