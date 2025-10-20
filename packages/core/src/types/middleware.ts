import { Context, Effect, Layer } from "effect";
import type { UploadistaError } from "../errors";

export type MiddlewareContext = {
  request: Request;
  uploadId?: string;
  metadata?: Record<string, string>;
};

export type MiddlewareNext = () => Promise<Response>;

export type Middleware = (
  context: MiddlewareContext,
  next: MiddlewareNext,
) => Promise<Response>;

// Effect-based Middleware service
export class MiddlewareService extends Context.Tag("MiddlewareService")<
  MiddlewareService,
  {
    readonly execute: (
      middlewares: Middleware[],
      context: MiddlewareContext,
      handler: MiddlewareNext,
    ) => Effect.Effect<Response, UploadistaError>;
  }
>() {}

export const MiddlewareServiceLive = Layer.succeed(
  MiddlewareService,
  MiddlewareService.of({
    execute: (middlewares, context, handler) =>
      Effect.gen(function* () {
        if (middlewares.length === 0) {
          return yield* Effect.tryPromise({
            try: () => handler(),
            catch: (error) => error as UploadistaError,
          });
        }

        const chain = middlewares.reduceRight(
          (next: MiddlewareNext, middleware: Middleware) => {
            return () => middleware(context, next);
          },
          handler,
        );

        return yield* Effect.tryPromise({
          try: () => chain(),
          catch: (error) => error as UploadistaError,
        });
      }),
  }),
);
