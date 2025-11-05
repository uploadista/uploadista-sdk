# Changelog

All notable changes to `@uploadista/adapters-express` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **New Adapter Pattern**: Implemented `expressAdapter()` factory following unified `ServerAdapter` interface
- **Request Extraction** in `express-http-handler.ts`:
  - `extractExpressRequest()` - Converts Express Request to typed `UploadistaRequest`
  - Full routing logic for upload, flow, and jobs endpoints
  - Support for all HTTP methods (POST, GET, PATCH)
  - Manual JSON body parsing when needed
  - Node.js stream to web ReadableStream conversion
  - Query parameter and path segment parsing
- **Response Handling** in `express-http-handler.ts`:
  - `sendExpressResponse()` - Converts `UploadistaResponse` to Express Response
  - Proper header setting via `reply.header()`
  - Status code and body handling via Express API
- **WebSocket Support** in `express-websocket-handler.ts`:
  - `expressWebSocketHandler()` - Creates WebSocket handler for `ws` package
  - Token-based and cookie-based authentication
  - Connection lifecycle management with Node.js IncomingMessage
  - Event subscription/unsubscription for uploads and flows
  - Auth context caching per connection
  - Proper cleanup on connection close
- **Context Type**: Introduced `ExpressContext` wrapping Request and Response

### Changed

- **Architecture**: Refactored to modular adapter pattern using `@uploadista/server`
- **Dependencies**: Now delegates to `@uploadista/server` for all business logic
- **API**: New `expressAdapter()` replaces legacy adapter creation (V1 API removed after cleanup)
- **Stream Handling**: Proper Node.js to Web ReadableStream conversion for chunked uploads

### Removed

- Legacy monolithic adapter implementation (removed during cleanup)
- Duplicated routing logic (now in `extractExpressRequest()`)
- Duplicated auth middleware execution (delegated to core server)
- Duplicated layer composition (handled by core server)
- Duplicated error handling (unified via core server)

### Benefits

- **Consistency**: Behavior identical across all framework adapters
- **Code Reduction**: Significant reduction in adapter-specific code
- **Maintainability**: Changes only needed in adapter-specific translation code
- **WebSocket Integration**: Seamless integration with standard `ws` package

### Technical Details

- Works with Express 4.x and 5.x
- Compatible with `ws` package for WebSocket support
- Properly handles Express middleware chain
- Supports both JSON and streaming request bodies

### Migration

See adapter documentation for migration from previous versions.

## [0.0.8] - Previous Version

Monolithic adapter implementation with all logic embedded.
