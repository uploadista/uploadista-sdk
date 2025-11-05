# Type Naming Conventions

This document establishes naming conventions for type utilities in the Uploadista SDK to ensure consistency and clarity across the codebase.

## Overview

Type utilities in Uploadista SDK follow predictable naming patterns that indicate their purpose and behavior. Understanding these patterns helps developers quickly identify what a type does and how to use it.

## Naming Pattern

All type utilities follow this pattern:

```
{Verb}{Subject}{Modifier?}
```

### Components

1. **Verb**: Describes what the type does (Extract, Validate, Infer, Resolve)
2. **Subject**: The domain or type being operated on (Layer, Effect, Flow, Plugin, Node)
3. **Modifier**: Optional suffix for specificity (Service, Services, Error, Requirements)

## Standard Verbs

### `Extract`

**Purpose**: Pull type information from a complex structure.

**Pattern**: `Extract{Subject}{Property}`

**Examples**:
- `ExtractLayerService<T>` - Extract service type from a Layer
- `ExtractLayerServices<T>` - Extract all services from a tuple of Layers
- `ExtractEffectError<T>` - Extract error type from an Effect
- `ExtractEffectRequirements<T>` - Extract requirements from an Effect
- `ExtractFlowPluginRequirements<T>` - Extract plugin requirements from a Flow function

**Usage**: When you need to unwrap or extract a specific type parameter from a generic type.

### `Validate`

**Purpose**: Perform compile-time validation returning either `true` or an error object.

**Pattern**: `Validate{Subject}{Constraint?}`

**Examples**:
- `ValidatePlugins<TPlugins, TRequirements>` - Validate plugins satisfy requirements
- `ValidatePluginRequirements<TPlugins, TRequirements>` - Alias for ValidatePlugins

**Usage**: When you want compile-time type checking that produces helpful error messages.

**Return Type**: Either `true` or an error object with `__error`, `__required`, `__provided`, `__missing` properties.

### `Infer`

**Purpose**: Derive or deduce types from schemas or definitions.

**Pattern**: `Infer{Subject}{Property?}`

**Examples**:
- `InferFlowRequirements<T>` - Infer requirements from a flow function type
- `InferNode<T>` - Infer concrete node type from node definition

**Usage**: When TypeScript needs to derive a type from a complex definition or function signature.

### `Resolve`

**Purpose**: Unwrap Effect or complex types to their base/success types.

**Pattern**: `Resolve{Subject}`

**Examples**:
- `ResolveEffect<T>` - Unwrap Effect to get success type
- `ResolvedNodesRecord<T>` - Record of resolved node types

**Usage**: When you need to strip Effect wrappers or resolve to concrete types.

## Subject Categories

### Layer Types

**Prefix**: `Layer`

Types dealing with Effect-TS Layer types:
- `ExtractLayerService<T>` - Single service from one layer
- `ExtractLayerServices<T>` - Union of services from multiple layers

### Effect Types

**Prefix**: `Effect`

Types dealing with Effect-TS Effect types:
- `ResolveEffect<T>` - Success type
- `ExtractEffectError<T>` - Error type
- `ExtractEffectRequirements<T>` - Requirements type

### Flow Types

**Prefix**: `Flow`

Types dealing with flow definitions and execution:
- `FlowRequirements<T>` - All requirements including UploadServer
- `FlowPluginRequirements<T>` - Plugin requirements (excludes UploadServer)
- `ExtractFlowPluginRequirements<T>` - Extract from flow function
- `TypedFlow<T>` - Type-safe flow with inferred types

### Plugin Types

**Prefix**: `Plugin`

Types dealing with plugin layers and validation:
- `PluginServices<T>` - Extract services from plugin tuple
- `ValidatePlugins<TPlugins, TRequirements>` - Validate plugin configuration

### Node Types

**Prefix**: `Node`

Types dealing with flow nodes:
- `NodeDefinition<TError, TReq>` - Node or Effect returning node
- `NodeDefinitionsRecord` - Record of node definitions
- `NodesRequirementsUnion<T>` - Union of all node requirements

## Plural vs Singular

### Singular Form

Used when extracting or operating on a single item:
- `ExtractLayerService<T>` - One service from one layer
- `NodeDefinition` - Definition for one node

### Plural Form

Used when dealing with collections or unions:
- `ExtractLayerServices<T>` - Multiple services from layer tuple
- `PluginServices<T>` - Union of all plugin services
- `NodesRequirementsUnion<T>` - Union of requirements from all nodes

## Suffix Conventions

### `Union`

Indicates a union type of extracted values:
- `NodesRequirementsUnion<T>` - Union of all node requirements
- `NodesErrorUnion<T>` - Union of all node errors

### `Record`

Indicates a mapped type/record:
- `NodeDefinitionsRecord` - Record mapping IDs to definitions
- `ResolvedNodesRecord<T>` - Record of resolved nodes
- `FlowInputMap<T>` - Record mapping input IDs to types
- `FlowOutputMap<T>` - Record mapping output IDs to types

### `Map`

Similar to Record, used for input/output mappings:
- `FlowInputMap<T>` - Maps input node IDs to their schema types
- `FlowOutputMap<T>` - Maps output node IDs to their schema types

## Deprecated Naming

The following names are deprecated and should be migrated:

| Deprecated | New | Reason |
|------------|-----|--------|
| `LayerSuccessUnion<T>` | `ExtractLayerServices<T>` | Inconsistent verb, "Success" ambiguous |
| `FlowRequirementsOf<T>` | `ExtractFlowPluginRequirements<T>` | Inconsistent pattern |
| `RequiredPluginsOf<T>` | `ExtractFlowPluginRequirements<T>` | Inconsistent pattern |
| `PluginAssertion<T, P>` | `ValidatePlugins<P, T>` | Clearer verb, better parameter order |
| `ExtractServicesFromLayers<T>` | `ExtractLayerServices<T>` | Verbose, inconsistent with pattern |

## Examples by Use Case

### Extracting Type Information

```typescript
// Extract service from a single layer
type MyLayer = Layer.Layer<ImagePlugin, never, never>;
type Service = ExtractLayerService<MyLayer>;
// Result: ImagePlugin

// Extract services from multiple layers
type MyLayers = [ImagePluginLayer, ZipPluginLayer];
type Services = ExtractLayerServices<MyLayers>;
// Result: ImagePlugin | ZipPlugin

// Extract requirements from an Effect
type MyEffect = Effect.Effect<string, Error, Database | Logger>;
type Requirements = ExtractEffectRequirements<MyEffect>;
// Result: Database | Logger
```

### Validating Types

```typescript
// Validate plugins at compile time
type Validation = ValidatePlugins<
  [ImagePluginLayer, ZipPluginLayer],
  ImagePlugin | ZipPlugin
>;
// Result: true

type InvalidValidation = ValidatePlugins<
  [ImagePluginLayer],
  ImagePlugin | ZipPlugin
>;
// Result: { __error: "Missing required plugins", __missing: ZipPlugin, ... }
```

### Inferring Types

```typescript
// Infer requirements from a flow function
const myFlow: TypeSafeFlowFunction<ImagePlugin | ZipPlugin> = ...;
type Requirements = InferFlowRequirements<typeof myFlow>;
// Result: ImagePlugin | ZipPlugin
```

### Resolving Types

```typescript
// Resolve Effect to success type
type MyEffect = Effect.Effect<User, AuthError, Database>;
type User = ResolveEffect<MyEffect>;
// Result: User

// Handles non-Effect types too
type Plain = { id: string };
type Resolved = ResolveEffect<Plain>;
// Result: { id: string }
```

## Best Practices

### 1. Follow the Verb-Subject-Modifier Pattern

✅ **Good**:
```typescript
type ExtractLayerService<T> = ...
type ValidatePlugins<T, R> = ...
type InferFlowRequirements<T> = ...
```

❌ **Bad**:
```typescript
type LayerServiceExtractor<T> = ...
type PluginValidator<T, R> = ...
type FlowRequirementsInference<T> = ...
```

### 2. Use Consistent Plurality

✅ **Good**:
```typescript
ExtractLayerService<T>   // singular - one layer
ExtractLayerServices<T>  // plural - multiple layers
```

❌ **Bad**:
```typescript
ExtractLayerService<T>    // singular for one
ExtractLayerService<T[]>  // same name for multiple
```

### 3. Be Specific with Modifiers

✅ **Good**:
```typescript
ExtractEffectError<T>         // Clear: error type
ExtractEffectRequirements<T>  // Clear: requirements type
```

❌ **Bad**:
```typescript
ExtractEffect<T>       // Unclear: which part?
GetEffectStuff<T>      // Vague: what stuff?
```

### 4. Document All Type Parameters

Always include JSDoc with:
- Template parameter descriptions
- Return type description
- At least one example
- Related types (cross-references)

```typescript
/**
 * Extracts service type from an Effect Layer.
 *
 * @template T - The Layer type to extract from
 * @returns The service type provided by the layer, or never if T is not a Layer
 *
 * @example
 * ```typescript
 * type MyLayer = Layer.Layer<ServiceA, never, never>;
 * type Service = ExtractLayerService<MyLayer>;
 * // Service = ServiceA
 * ```
 *
 * @see ExtractLayerServices - For extracting from multiple layers
 */
export type ExtractLayerService<T> = ...
```

## Migration Guide

When renaming types:

1. **Add the new type with preferred name**
2. **Mark old type as deprecated** with `@deprecated` JSDoc
3. **Create type alias** pointing to new type
4. **Add migration example** in deprecation notice
5. **Update internal usage** to new name
6. **Wait one major version** before removing

Example:

```typescript
/**
 * @deprecated Use `ExtractLayerServices` instead.
 *
 * @example Migration
 * ```typescript
 * // Old
 * type Services = LayerSuccessUnion<[Layer1, Layer2]>;
 *
 * // New
 * type Services = ExtractLayerServices<[Layer1, Layer2]>;
 * ```
 */
export type LayerSuccessUnion<T extends readonly Layer[]> = ExtractLayerServices<T>;
```

## Tooling

### TypeScript Compiler

The naming conventions work with TypeScript's type inference:
- `Extract*` types are typically distributive conditional types
- `Validate*` types use conditional types to return error objects
- `Infer*` types leverage TypeScript's `infer` keyword
- `Resolve*` types unwrap or simplify complex types

### IDE Support

Good naming conventions improve IDE autocomplete:
- Typing `Extract` shows all extraction utilities
- Typing `Validate` shows all validation utilities
- Typing `Flow` shows all flow-related types
- Typing `Plugin` shows all plugin-related types

## Summary

Following these conventions ensures:
- **Predictability**: Developers know what to expect from type names
- **Discoverability**: Types are easy to find via autocomplete
- **Consistency**: Similar operations use similar naming patterns
- **Clarity**: Names clearly indicate purpose and behavior

When in doubt, follow the pattern: `{Verb}{Subject}{Modifier}` ✨
