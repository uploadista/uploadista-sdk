import { Context, Effect, Layer } from "effect";

/**
 * Metrics Recording Service
 *
 * Provides access to metrics recording functionality throughout
 * the upload and flow processing pipeline. The service is provided
 * via Effect Layer and can be accessed using Effect.service().
 */
export class MetricsService extends Context.Tag("MetricsService")<
  MetricsService,
  {
    /**
     * Record upload metrics for an organization
     */
    readonly recordUpload: (
      clientId: string,
      bytes: number,
      metadata?: Record<string, unknown>,
    ) => Effect.Effect<void, never>;
  }
>() {}

/**
 * No-op implementation of MetricsService that does nothing.
 * Used when metrics are disabled or database is not available.
 */
export const NoOpMetricsServiceLive: Layer.Layer<MetricsService> =
  Layer.succeed(MetricsService, {
    recordUpload: (_organizationId: string, _bytes: number) => Effect.void,
  });
