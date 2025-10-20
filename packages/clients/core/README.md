# @uploadista/client-core

Platform-agnostic core upload client logic for Uploadista.

## Overview

This package contains the core upload orchestration logic that is shared across all platform-specific client implementations (browser, React Native, Expo, etc.). It provides:

- Service interfaces for dependency injection
- Platform-agnostic types and error handling
- Network monitoring and performance tracking
- Chunk buffering utilities
- Upload fingerprinting abstractions

## Architecture

The client-core package is designed to be platform-independent and does NOT include any browser-specific or React Native-specific dependencies. It uses ES2020 as the target and does not include DOM types.

### Service Interfaces

Platform-specific implementations must provide concrete implementations of these services:

- `StorageService` - Persistent storage for upload state (localStorage, AsyncStorage, etc.)
- `IdGenerationService` - Unique ID generation (crypto.randomUUID, uuid library, etc.)
- `HttpClient` - HTTP request handling with connection pooling
- `FileReaderService` - File reading and slicing for chunked uploads
- `Base64Service` (optional) - Base64 encoding/decoding

### Service Container

The `ServiceContainer` interface defines the required services that must be injected into the upload client:

```typescript
interface ServiceContainer {
  storage: StorageService;
  idGeneration: IdGenerationService;
  httpClient: HttpClient;
  fileReader: FileReaderService;
  base64?: Base64Service;
}
```

## Usage

This package is not meant to be used directly. Instead, use one of the platform-specific implementations:

- `@uploadista/client-browser` - For web browsers
- `@uploadista/client-react-native` - For React Native apps
- `@uploadista/client-expo` - For Expo apps

## Exports

```typescript
// Service interfaces
export * from "./services";

// Core types
export * from "./types";
export * from "./error";
export * from "./logger";
export * from "./previous-upload";
export * from "./generate-fingerprint";

// Utilities
export * from "./network-monitor";
export * from "./chunk-buffer";
```

## TypeScript Configuration

This package uses strict TypeScript configuration with:
- Target: ES2020
- Lib: ES2020 only (no DOM)
- Strict mode enabled
- No unchecked indexed access

## Dependencies

Minimal dependencies:
- `@uploadista/core` - Core uploadista types and utilities

## Development

```bash
# Format code
pnpm run format

# Lint code
pnpm run lint

# Check (format + lint)
pnpm run check
```

## Design Principles

1. **Platform Independence** - No platform-specific code or dependencies
2. **Dependency Injection** - All platform-specific services are injected
3. **Type Safety** - Full TypeScript support with strict mode
4. **Zero Runtime Assumptions** - No assumptions about the runtime environment
