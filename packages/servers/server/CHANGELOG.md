# Changelog

All notable changes to `@uploadista/server` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Unified Adapter Pattern**: Introduced `ServerAdapter<TContext, TResponse, TWebSocket>` interface to standardize framework integration
- **Core Server Implementation**: Added `createUploadistaServer()` function that handles all common server logic:
  - Route parsing and request type determination
  - Auth middleware execution with 5-second timeout protection
  - Layer composition (upload server, flow server, auth, metrics, plugins)
  - Error handling with `handleFlowError()` utility
  - Effect program execution with optional tracing support
- **Adapter Interface Types** in `src/adapter/types.ts`:
  - `StandardRequest` - Framework-agnostic request representation
  - `StandardResponse` - Framework-agnostic response representation
  - `WebSocketHandler` - Framework-agnostic WebSocket interface
  - `ServerAdapter` - Interface that framework adapters must implement
- **Core Server Types** in `src/core/types.ts`:
  - `UploadistaServerConfig` - Configuration for unified server
  - `UploadistaServer` - Return type with handler, websocketHandler, and dispose
- **Typed Request/Response Routes** in `src/core/routes.ts`:
  - Strongly-typed route definitions for all endpoints (upload, flow, jobs)
  - Request types: `CreateUploadRequest`, `GetUploadRequest`, `UploadChunkRequest`, etc.
  - Response types: `CreateUploadResponse`, `GetUploadResponse`, etc.
  - Error types: `NotFoundRequest`, `BadRequestRequest`, `MethodNotAllowedRequest`
- **HTTP Handlers** in `src/core/http-handlers/`:
  - `handleUploadistaRequest()` - Central request router
  - Upload handlers: `handleCreateUpload()`, `handleGetUpload()`, `handleUploadChunk()`, `handleGetCapabilities()`
  - Flow handlers: `handleGetFlow()`, `handleRunFlow()`, `handleJobStatus()`, `handleResumeFlow()`, `handlePauseFlow()`, `handleCancelFlow()`
- **WebSocket Handlers** in `src/core/websocket-handlers/`:
  - `handleWebSocketOpen()` - Subscription management
  - `handleWebSocketMessage()` - Message handling (ping/pong)
  - `handleWebSocketClose()` - Cleanup and unsubscription
  - `handleWebSocketError()` - Error logging
- **Managed Runtime**: Uses Effect's `ManagedRuntime` for proper resource lifecycle management
- **Auth Cache Support**: Configurable auth caching via `AuthCacheConfig`

### Changed

- **Architecture**: Moved from adapter-specific implementations to centralized core server
- **Layer Composition**: Now handled uniformly in core server instead of each adapter
- **Error Handling**: Standardized via `handleFlowError()` across all adapters
- **Request Routing**: Delegated to adapters via `extractRequest()` returning typed `UploadistaRequest` objects

### Benefits

- **Code Reduction**: Eliminates ~80% code duplication across framework adapters
- **Consistency**: All frameworks guaranteed identical routing, auth, and error handling behavior
- **Maintainability**: Bug fixes and features only need to be implemented once
- **Testability**: Core logic can be tested independently with mock adapters
- **Extensibility**: New frameworks can be added with ~100-150 lines of adapter code

### Technical Details

- Uses Effect.js for composable error handling and layer composition
- Supports optional OpenTelemetry tracing via `withTracing` flag
- Integrates with existing observability system (`@uploadista/observability`)
- Compatible with all event emitters and broadcasters
- Maintains backward compatibility through separate adapter implementations

## [0.0.8] - Previous Version

Initial implementation with framework-specific logic in each adapter.
