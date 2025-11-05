# Changelog

All notable changes to `@uploadista/adapters-fastify` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **New Adapter Pattern**: Implemented `fastifyAdapter()` factory following unified `ServerAdapter` interface
- **Request Extraction** in `fastify-http-handler.ts`:
  - `extractFastifyRequest()` - Converts Fastify Request to typed `UploadistaRequest`
  - Full routing logic for upload, flow, and jobs endpoints
  - Support for all HTTP methods (POST, GET, PATCH)
  - Automatic JSON body parsing via Fastify
  - Node.js stream to web ReadableStream conversion for chunked uploads
  - Query parameter and path segment parsing
  - Content-Type handling for JSON and octet-stream
- **Response Handling** in `fastify-http-handler.ts`:
  - `sendFastifyResponse()` - Converts `UploadistaResponse` to Fastify Reply
  - Proper header setting via `reply.header()`
  - Status code and body handling via Fastify Reply API
  - Automatic Content-Type header when not specified
- **WebSocket Support** in `fastify-websocket-handler.ts`:
  - `fastifyWebSocketHandler()` - Creates WebSocket handler for `@fastify/websocket`
  - Token-based and cookie-based authentication
  - Connection lifecycle management with FastifyRequest
  - Event subscription/unsubscription for uploads and flows
  - Auth context caching per connection
  - Proper cleanup on connection close
  - Error handling with graceful connection termination
- **Context Type**: Introduced `FastifyContext` wrapping Request and Reply

### Changed

- **Architecture**: Refactored from monolithic adapter to modular adapter pattern using `@uploadista/server`
- **Code Size**: Reduced from 577 lines to ~310 lines (**46% reduction**)
- **Dependencies**: Now delegates to `@uploadista/server` for all business logic
- **API**: New `fastifyAdapter()` replaces legacy adapter creation (V1 API removed after cleanup)
- **Stream Handling**: Proper Node.js to Web ReadableStream conversion (fixes "getReader is not a function" error)

### Fixed

- **Stream Conversion Bug**: Fixed incorrect casting of Node.js streams to web ReadableStream
  - Now properly converts `request.raw` stream in PATCH `/upload/:uploadId` endpoint
  - Now properly converts streaming data in PATCH `/jobs/:jobId/resume/:nodeId` endpoint
  - Uses proper ReadableStream constructor with controller pattern

### Removed

- Legacy monolithic adapter implementation (removed during cleanup)
- Duplicated routing logic (now in `extractFastifyRequest()`)
- Duplicated auth middleware execution (delegated to core server)
- Duplicated layer composition (handled by core server)
- Duplicated error handling (unified via core server)

### Benefits

- **Consistency**: Behavior identical across all framework adapters
- **Maintainability**: Changes only needed in adapter-specific translation code
- **WebSocket Integration**: Seamless integration with `@fastify/websocket`
- **Type Safety**: Full TypeScript support with Fastify generics

### Technical Details

- Works with Fastify 4.x and 5.x
- Compatible with `@fastify/websocket` 10.x and 11.x
- Properly handles Fastify's automatic body parsing
- Supports both JSON and streaming request bodies
- Integrates with Fastify's plugin system

### Migration

See adapter documentation for migration from previous versions.

## [0.0.8] - Previous Version

Monolithic adapter implementation with all logic embedded.
