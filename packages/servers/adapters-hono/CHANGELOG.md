# Changelog

All notable changes to `@uploadista/adapters-hono` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **New Adapter Pattern**: Implemented `honoAdapter()` factory following unified `ServerAdapter` interface
- **Request Extraction** in `hono-http-handler.ts`:
  - `extractHonoRequest()` - Converts Hono Context to typed `UploadistaRequest`
  - Full routing logic for upload, flow, and jobs endpoints
  - Support for all HTTP methods (POST, GET, PATCH)
  - JSON and streaming data handling
  - Query parameter and path segment parsing
- **Response Handling** in `hono-http-handler.ts`:
  - `sendHonoResponse()` - Converts `UploadistaResponse` to Web API Response
  - Automatic Content-Type header handling
  - Proper status code and body serialization
- **WebSocket Support** in `hono-websocket-handler.ts`:
  - `honoWebSocketHandler()` - Creates Hono WSEvents handler
  - Token-based and cookie-based authentication
  - Connection lifecycle management
  - Event subscription/unsubscription for uploads and flows
  - Auth context caching per connection
- **Type Safety**: Fully typed with TypeScript generics for Hono environment

### Changed

- **Architecture**: Refactored from monolithic `createHonoUploadistaAdapter()` to modular adapter pattern
- **Code Size**: Reduced from 657 lines to ~190 lines (**71% reduction**)
- **Dependencies**: Now delegates to `@uploadista/server` for all business logic
- **API**: New `honoAdapter()` replaces legacy adapter creation (V1 API removed after cleanup)

### Removed

- Legacy `createHonoUploadistaAdapter()` implementation (removed during cleanup)
- Duplicated routing logic (now in `extractHonoRequest()`)
- Duplicated auth middleware execution (delegated to core server)
- Duplicated layer composition (handled by core server)
- Duplicated error handling (unified via core server)

### Benefits

- **Consistency**: Behavior identical across all framework adapters
- **Maintainability**: Changes only needed in adapter-specific translation code
- **Testing**: Integration tests validate full request/response cycle

### Migration

See adapter documentation for migration from previous versions.

## [0.0.8] - Previous Version

Monolithic adapter implementation with all logic embedded.
