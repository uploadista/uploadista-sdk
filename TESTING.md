# Testing Guide for uploadista-sdk

This document describes testing patterns and conventions for the uploadista-sdk monorepo.

## Table of Contents
- [Testing Stack](#testing-stack)
- [Test Organization](#test-organization)
- [Running Tests](#running-tests)
- [Effect Testing Patterns](#effect-testing-patterns)
- [Test vs Live Layer Convention](#test-vs-live-layer-convention)
- [Writing Tests](#writing-tests)
- [Coverage](#coverage)

## Testing Stack

All uploadista-sdk packages use:
- **Vitest 4.0.8** - Fast, modern test framework with TypeScript support
- **@effect/vitest** - Effect-aware testing utilities for Effect-based code
- **V8 Coverage** - Built-in code coverage reporting

## Test Organization

### Directory Structure

Tests are organized in dedicated `tests/` directories that mirror the `src/` structure:

```
packages/core/
├── src/
│   ├── flow/
│   │   ├── flow.ts
│   │   └── node.ts
│   └── streams/
│       └── stream-limiter.ts
└── tests/
    ├── flow/
    │   ├── flow.test.ts
    │   └── node.test.ts
    ├── streams/
    │   └── stream-limiter.test.ts
    └── utils/
        └── test-layers.ts  # Shared test utilities
```

### Test File Naming

- Test files use the `.test.ts` extension
- Test file names should match the source file they're testing
- Utility files in `tests/utils/` do NOT use `.test.ts` extension

## Running Tests

### Package-level Commands

Each package with tests includes these scripts:

```bash
# Interactive watch mode (default)
pnpm test

# Run tests once and exit
pnpm test:run

# Watch mode (explicit)
pnpm test:watch

# Run with coverage
pnpm test:run --coverage
```

### Workspace-level Commands

From the uploadista-sdk root:

```bash
# Run all package tests
pnpm -r test:run

# Run tests for specific package
pnpm --filter @uploadista/core test:run
```

## Effect Testing Patterns

The uploadista-sdk is built on [Effect](https://effect.website), and tests should leverage Effect's testing utilities from `@effect/vitest`.

### 1. Using `it.effect()` for Effect Operations

Use `it.effect()` instead of standard `it()` when testing Effect operations:

```typescript
import { it } from "@effect/vitest";
import { Effect } from "effect";

it.effect("should process data", () =>
  Effect.gen(function* () {
    const result = yield* processData(input);
    expect(result).toBe(expected);
  })
);
```

### 2. Using `TestClock` for Time Control

For testing timeouts, delays, and scheduled operations without real delays:

```typescript
import { it } from "@effect/vitest";
import { Effect, TestClock } from "effect";

it.effect("should handle timeout", () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.timeout(operation, "5 seconds").pipe(
      Effect.fork
    );

    // Advance time instantly without waiting
    yield* TestClock.adjust("6 seconds");

    const result = yield* Fiber.join(fiber);
    expect(result).toBe(None);
  })
);
```

### 3. Using `Layer.mock()` for Service Mocking

Mock Effect services with partial implementations:

```typescript
import { Layer, Context, Effect } from "effect";

// Define service
interface DataStore {
  readonly upload: (data: Uint8Array) => Effect.Effect<{ key: string }, Error>;
}

const DataStore = Context.GenericTag<DataStore>("@uploadista/DataStore");

// Create Test layer (mock)
const DataStoreTest = Layer.succeed(
  DataStore,
  DataStore.of({
    upload: (data) => Effect.succeed({ key: `mock-${data.length}` }),
  })
);

// Use in tests
it.effect("should upload file", () =>
  Effect.gen(function* () {
    const store = yield* DataStore;
    const result = yield* store.upload(new Uint8Array([1, 2, 3]));
    expect(result.key).toBe("mock-3");
  }).pipe(Effect.provide(DataStoreTest))
);
```

### 4. Using `it.scoped()` for Resource Management

For tests requiring Scope lifecycle:

```typescript
import { it } from "@effect/vitest";
import { Effect } from "effect";

it.scoped("should manage resources", () =>
  Effect.gen(function* () {
    const resource = yield* acquireResource();
    // Resource automatically released after test
    yield* useResource(resource);
  })
);
```

### 5. Using `it.live()` for Integration Tests

For tests that need to run against real services (opt-in):

```typescript
import { it } from "@effect/vitest";

it.live("should connect to real S3", () =>
  Effect.gen(function* () {
    // Uses real S3 client - requires credentials
    const result = yield* s3Store.upload(file);
    expect(result.key).toBeDefined();
  }).pipe(Effect.provide(S3StoreLive))
);
```

## Test vs Live Layer Convention

Follow Effect's naming convention for layers:

- **`ServiceNameLive`** - Production layer with real implementation (e.g., `S3StoreLive`)
- **`ServiceNameTest`** - Test layer with mocked implementation (e.g., `S3StoreTest`)

Example:

```typescript
// Live layer - real S3 client
export const S3StoreLive = Layer.effect(
  S3Store,
  Effect.gen(function* () {
    const client = new S3Client({ region: "us-east-1" });
    return {
      upload: (data) => /* real S3 upload */,
      download: (key) => /* real S3 download */,
    };
  })
);

// Test layer - mocked S3 client
export const S3StoreTest = Layer.succeed(
  S3Store,
  S3Store.of({
    upload: (data) => Effect.succeed({ key: "test-key" }),
    download: (key) => Effect.succeed(new Uint8Array([1, 2, 3])),
  })
);
```

## Writing Tests

### Test Structure

Follow the Arrange-Act-Assert pattern:

```typescript
import { describe, it, expect } from "vitest";

describe("FeatureName", () => {
  describe("functionName", () => {
    it("should do something specific", () => {
      // Arrange - set up test data
      const input = createTestInput();

      // Act - execute the code under test
      const result = functionName(input);

      // Assert - verify the result
      expect(result).toBe(expected);
    });
  });
});
```

### For Effect-based code

```typescript
import { it } from "@effect/vitest";
import { Effect } from "effect";

describe("FeatureName", () => {
  it.effect("should process Effect operation", () =>
    Effect.gen(function* () {
      // Arrange
      const input = createTestInput();

      // Act
      const result = yield* effectFunction(input);

      // Assert
      expect(result).toBe(expected);
    })
  );
});
```

### Testing Error Scenarios

```typescript
it.effect("should handle errors", () =>
  Effect.gen(function* () {
    const result = yield* riskyOperation().pipe(
      Effect.exit
    );

    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(result.cause).toMatchObject({ message: "Expected error" });
    }
  })
);
```

## Coverage

### Running Coverage Reports

```bash
# Generate coverage report
pnpm test:run --coverage

# Coverage output:
# - Terminal: Text summary
# - coverage/index.html: Interactive HTML report
# - coverage/coverage-final.json: JSON data
```

### Coverage Configuration

All packages use consistent coverage settings:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.d.ts",
        "**/*.test.ts",
        "**/*.spec.ts",
        "tests/",
      ],
    },
  },
});
```

### Coverage Targets

- **Baseline**: 70% coverage for all packages
- **Critical packages** (core, server): 80%+ coverage target
- **New code**: Aim for high coverage on new features

## Package-specific Testing Notes

### Core Package

- Tests flow engine DAG processing
- Tests upload chunking and coordination
- Tests stream utilities and backpressure
- Uses TestClock for debounce/throttle tests

### Data Stores

- Mock external clients (S3, Azure, GCS) by default
- Integration tests with real services behind environment flags
- Test multipart upload coordination
- Test error handling and retries

### KV Stores

- Use Memory KV store for tests requiring KV functionality
- Shared compliance test suite for interface verification
- Test TTL and expiration using TestClock

### Server Packages

- Test HTTP handlers with mock requests
- Test WebSocket connection lifecycle
- Test authentication and authorization
- Test plugin system validation

### Flow Nodes

- Test node execution with valid inputs
- Test error handling with invalid inputs
- Test output format validation
- Test integration in complete flows

## Additional Resources

- [Effect Testing Documentation](https://effect.website/docs/testing/introduction)
- [Vitest Documentation](https://vitest.dev/)
- [@effect/vitest Documentation](https://effect.website/docs/testing/vitest)
- [Core Test Utilities](/packages/core/tests/utils/test-layers.ts) - Reusable test helpers

## Contributing

When adding new features:

1. Add tests covering the new functionality
2. Ensure tests pass: `pnpm test:run`
3. Check coverage: `pnpm test:run --coverage`
4. Follow existing test patterns and conventions
5. Update this guide if introducing new patterns

## Troubleshooting

### Tests timing out

- Increase timeout: `it("test", () => {...}, { timeout: 10000 })`
- Check for missing `await` or `yield*` in async operations
- Verify Effect operations are properly executed

### Coverage not updating

- Clear coverage directory: `rm -rf coverage`
- Rebuild package: `pnpm build`
- Run tests again: `pnpm test:run --coverage`

### Effect tests not working

- Ensure `@effect/vitest` is imported: `import { it } from "@effect/vitest"`
- Use `it.effect()` not `it()` for Effect operations
- Provide required layers using `Effect.provide()`
