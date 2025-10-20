// Legacy Node.js implementation (for Node.js environments only)
export * from "./gcs-store";

// New service-based implementations (recommended)
export { gcsStoreNodejs, gcsStoreRest } from "./gcs-store-v2";
export * from "./services";
