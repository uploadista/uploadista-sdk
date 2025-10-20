# Framework Integration Guide

This guide explains how to wrap `@uploadista/client` in a framework-specific client package (React, Vue, Angular, Svelte, etc.).

## Overview

The `@uploadista/client` package is designed to be framework-agnostic. It provides:

- **UploadistaClient**: Core client for uploads and flow management
- **Event-based architecture**: Plain JavaScript callbacks, no framework coupling
- **Type-safe API**: Full TypeScript support
- **WebSocket management**: Unified WebSocket handling for upload and flow events
- **Authentication**: Flexible auth strategies

## Architecture Pattern

Framework clients should wrap the base client with framework-specific primitives:

```
┌─────────────────────────────────────────────────────────────┐
│                Framework Client Layer                        │
│  - Framework-specific state management (hooks/composables)  │
│  - Component library                                         │
│  - Dependency injection (Context/Provide-Inject/Services)   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│            Base Client (@uploadista/client)                  │
│  - UploadistaClient (framework-agnostic)                    │
│  - Event handlers (plain callbacks)                          │
│  - WebSocket management                                      │
└─────────────────────────────────────────────────────────────┘
```

## Key Integration Points

### 1. Client Instance Management

**Challenge**: Share a single client instance across the application.

**Solutions**:
- **React**: Context API + `useContext` hook
- **Vue**: Plugin + `provide`/`inject`
- **Angular**: Injectable service
- **Svelte**: Context API

**Example (React)**:
```typescript
import { createContext, useContext } from 'react'
import { createUploadistaClient, type UploadistaClient } from '@uploadista/client'

const UploadistaContext = createContext<UploadistaClient | null>(null)

export function UploadistaProvider({ children, options }) {
  const client = useMemo(() => createUploadistaClient(options), [options])
  return <UploadistaContext.Provider value={client}>{children}</UploadistaContext.Provider>
}

export function useUploadistaClient() {
  const client = useContext(UploadistaContext)
  if (!client) throw new Error('useUploadistaClient must be used within UploadistaProvider')
  return client
}
```

**Example (Vue)**:
```typescript
import { inject, type App } from 'vue'
import { createUploadistaClient, type UploadistaClient } from '@uploadista/client'

const UPLOADISTA_CLIENT_KEY = Symbol('uploadista-client')

export function createUploadistaPlugin(options: UploadistaOptions) {
  return {
    install(app: App) {
      const client = createUploadistaClient(options)
      app.provide(UPLOADISTA_CLIENT_KEY, client)
    }
  }
}

export function useUploadistaClient(): UploadistaClient {
  const client = inject(UPLOADISTA_CLIENT_KEY)
  if (!client) throw new Error('useUploadistaClient must be used within app with uploadista plugin')
  return client
}
```

### 2. State Management

**Challenge**: Expose upload/flow state reactively using framework primitives.

**Approach**:
1. Wrap client methods with framework state
2. Subscribe to client events using callbacks
3. Update reactive state on events
4. Clean up subscriptions on unmount

**Example (React)**:
```typescript
import { useState, useCallback, useEffect } from 'react'
import { useUploadistaClient } from './useUploadistaClient'

export function useUpload(options?: UseUploadOptions) {
  const client = useUploadistaClient()
  const [state, setState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    // ...
  })

  const upload = useCallback(async (file: File) => {
    setState(prev => ({ ...prev, status: 'uploading' }))

    try {
      const result = await client.upload(file, {
        onProgress: (_, bytesUploaded, totalBytes) => {
          setState(prev => ({
            ...prev,
            progress: totalBytes ? (bytesUploaded / totalBytes) * 100 : 0,
            bytesUploaded,
            totalBytes
          }))
        }
      })

      setState(prev => ({ ...prev, status: 'success', result }))
    } catch (error) {
      setState(prev => ({ ...prev, status: 'error', error }))
    }
  }, [client])

  return { state, upload }
}
```

**Example (Vue)**:
```typescript
import { reactive, readonly } from 'vue'
import { useUploadistaClient } from './useUploadistaClient'

export function useUpload(options?: UseUploadOptions) {
  const client = useUploadistaClient()
  const state = reactive<UploadState>({
    status: 'idle',
    progress: 0,
    // ...
  })

  const upload = async (file: File) => {
    state.status = 'uploading'

    try {
      const result = await client.upload(file, {
        onProgress: (_, bytesUploaded, totalBytes) => {
          state.progress = totalBytes ? (bytesUploaded / totalBytes) * 100 : 0
          state.bytesUploaded = bytesUploaded
          state.totalBytes = totalBytes
        }
      })

      state.status = 'success'
      state.result = result
    } catch (error) {
      state.status = 'error'
      state.error = error
    }
  }

  return { state: readonly(state), upload }
}
```

### 3. Event Handling

**Event System**: The base client uses plain callback functions for events.

**Event Types**:
- `onProgress`: Upload progress updates `(uploadId, bytesUploaded, totalBytes) => void`
- `onComplete`: Upload completion `(uploadId, result) => void`
- `onError`: Upload error `(uploadId, error) => void`
- `onAbort`: Upload aborted `(uploadId) => void`

**WebSocket Events**:
- `UploadEvent`: Upload-related events (progress, complete, error)
- `FlowEvent`: Flow execution events (node start, node complete, job complete)

**Integration Pattern**:
```typescript
// Framework wrapper should:
1. Accept event callbacks from user
2. Call base client methods with callbacks
3. Update framework state in callbacks
4. Clean up on unmount

// Example:
const upload = async (file: File) => {
  await client.upload(file, {
    onProgress: (id, bytes, total) => {
      // Update framework state
      updateState({ progress: (bytes / total) * 100 })
      // Call user callback if provided
      options?.onProgress?.(id, bytes, total)
    }
  })
}
```

### 4. Lifecycle Management

**Challenge**: Clean up resources when components unmount.

**Resources to clean up**:
- WebSocket connections
- Ongoing uploads (optionally abort)
- Event listeners
- Timers/intervals

**Example (React)**:
```typescript
useEffect(() => {
  // Setup
  const ws = client.openUploadWebSocket(uploadId)

  // Cleanup
  return () => {
    client.closeUploadWebSocket(uploadId)
  }
}, [uploadId])
```

**Example (Vue)**:
```typescript
import { onUnmounted } from 'vue'

export function useFlowUpload() {
  // Setup
  const ws = await client.openFlowWebSocket(jobId)

  // Cleanup
  onUnmounted(() => {
    client.closeFlowWebSocket(jobId)
  })
}
```

### 5. TypeScript Integration

**Import types from base client**:
```typescript
import type {
  UploadistaClient,
  UploadOptions,
  UploadResult,
  FlowUploadOptions,
  FlowResult
} from '@uploadista/client'
```

**Extend types for framework-specific needs**:
```typescript
// Add framework-specific options
export interface UseUploadOptions extends UploadOptions {
  onMounted?: () => void
  suspense?: boolean
}
```

### 6. Component Library (Optional)

Framework clients can provide basic unstyled components:

**Recommended components**:
- `UploadZone`: File input + drag-drop area
- `UploadList`: Display upload progress for multiple files
- `FlowUploadZone`: Upload through flow
- `FlowUploadList`: Display flow upload progress

**Principles**:
- Keep components unstyled or minimally styled
- Use slots/render props for customization
- Expose underlying composables/hooks
- Focus on functionality, not aesthetics

## Testing Strategy

### Unit Tests
- Mock base client responses
- Test state updates
- Verify cleanup logic
- Test error handling

### Integration Tests
- Test with real base client
- Verify event propagation
- Test WebSocket connections (mocked)
- Validate lifecycle management

## Framework-Specific Considerations

### React
- Use hooks for state management
- Memoize callbacks with `useCallback`
- Memoize derived state with `useMemo`
- Clean up in `useEffect` return
- Consider React 18+ features (Suspense, Transitions)

### Vue
- Use Composition API (`ref`, `reactive`, `computed`)
- Clean up in `onUnmounted`
- Use `readonly` to prevent external mutations
- Consider SSR with Nuxt.js
- Vue DevTools integration for debugging

### Angular
- Use Injectable services
- RxJS observables for events
- OnDestroy lifecycle hook for cleanup
- Angular Signals for reactive state
- Zone.js considerations

### Svelte
- Use stores for shared state
- Context API for client sharing
- `onDestroy` for cleanup
- Reactive statements for derived state
- SvelteKit SSR considerations

## Common Patterns

### Pattern 1: Multiple Upload Management

Track array of uploads with aggregate state:

```typescript
// Pseudo-code
const uploads = reactive([])
const aggregate = computed(() => ({
  totalProgress: average(uploads.map(u => u.progress)),
  allComplete: uploads.every(u => u.status === 'success'),
  hasErrors: uploads.some(u => u.status === 'error')
}))
```

### Pattern 2: Retry with Exponential Backoff

Implement retry logic in framework wrapper:

```typescript
const retry = async (file: File, attempt = 0) => {
  try {
    await upload(file)
  } catch (error) {
    if (attempt < maxRetries) {
      await delay(2 ** attempt * 1000)
      return retry(file, attempt + 1)
    }
    throw error
  }
}
```

### Pattern 3: Resumable Upload Recovery

Recover previous uploads on mount:

```typescript
// On mount
const previousUploads = await client.listPreviousUploads()
if (previousUploads.length > 0) {
  // Prompt user to resume or clear
}
```

## Checklist for New Framework Integration

- [ ] Client instance sharing mechanism (Context/Plugin/Service)
- [ ] Composables/Hooks for all upload patterns
  - [ ] Single upload
  - [ ] Multiple uploads
  - [ ] Flow upload
  - [ ] Multiple flow uploads
  - [ ] Drag and drop
  - [ ] Upload metrics
- [ ] WebSocket lifecycle management
- [ ] Cleanup on unmount
- [ ] TypeScript types for all public APIs
- [ ] Basic unstyled components
- [ ] Comprehensive example application
- [ ] Unit tests (>80% coverage)
- [ ] Integration tests
- [ ] Documentation (README, API reference)
- [ ] Migration guide (from other frameworks)

## Resources

- [Base Client Source](./src/)
- [React Client Example](../react/)
- [Vue Client Example](../vue/)
- [Framework Utilities](./src/framework-utils.ts)

## Support

For questions about framework integration, please:
1. Check existing framework clients for patterns
2. Review this guide
3. Open an issue with the `framework-integration` label
