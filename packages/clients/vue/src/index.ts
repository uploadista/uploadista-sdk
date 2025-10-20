/**
 * Uploadista Vue Client
 *
 * Vue 3 composables and components for file uploads with the Uploadista platform.
 *
 * @example
 * ```typescript
 * import { createUploadistaPlugin } from '@uploadista/vue'
 * import { UploadZone, FlowUploadZone } from '@uploadista/vue'
 *
 * // Install plugin in your Vue app
 * const app = createApp(App)
 * app.use(createUploadistaPlugin({
 *   client: uploadClient
 * }))
 * ```
 */

// Re-export all components
export * from "./components";
// Re-export all composables
export * from "./composables";
// Re-export the plugin
export * from "./composables/plugin";

export * from "./providers";
// Re-export utilities
export * from "./utils";
