import type { TypedOutput, UploadFile } from "@uploadista/core";
import {
  isStorageOutput,
  isStorageOutputV1,
  isStreamingInputV1,
} from "@uploadista/core";

/**
 * Type Guards Example
 *
 * This example demonstrates how to use type guards for type-safe narrowing
 * of TypedOutput values. Built-in type guards like isStorageOutputV1 and
 * isStreamingInputV1 are provided for common types.
 */

/**
 * Example 1: Built-in types with type guards
 *
 * Built-in types ('storage-output-v1') have pre-built type guards
 * that enable type-safe narrowing.
 */
export function exampleAutomaticNarrowing(outputs: TypedOutput[]): void {
  console.log("=== Type Guards for Built-in Types ===\n");

  for (const output of outputs) {
    // ✅ Use the pre-built type guard for narrowing
    if (isStorageOutputV1(output)) {
      // ✅ TypeScript knows output.data is UploadFile
      console.log("Storage Output:");
      console.log(`  - URL: ${output.data.url}`);
      console.log(`  - Size: ${output.data.size} bytes`);
      console.log(`  - ID: ${output.data.id}`);
      console.log(`  - Storage type: ${output.data.storage.type}`);
    } else if (isStreamingInputV1(output)) {
      console.log("Streaming Input:");
      console.log(`  - URL: ${output.data.url}`);
    } else {
      // Custom types or untyped nodes
      console.log(`Unknown type: ${output.nodeType || "untyped"}`);
    }
  }
}

/**
 * Example 2: Custom types still require type guards
 *
 * For custom registered types (like 'thumbnail-output-v1'), you still need
 * to use type guards for type narrowing. This is by design to keep the
 * system extensible.
 */
export function exampleCustomTypeGuards(outputs: TypedOutput[]): void {
  console.log("\n=== Type Guards for Custom Types ===\n");

  for (const output of outputs) {
    // Built-in types: use pre-built type guards
    if (isStorageOutputV1(output)) {
      console.log("Built-in (type guard):", output.data.url);
    }

    // Custom types: use custom type guards
    // Note: This example uses isStorageOutput to show the pattern
    // In real code, you'd use custom type guards like isThumbnailOutput
    else if (isStorageOutput(output)) {
      console.log("Custom (type guard):", output.data.url);
    }
  }
}

/**
 * Example 3: Categorizing outputs by type
 *
 * Use type guards to categorize outputs into different buckets.
 */
export function exampleHybridApproach(outputs: TypedOutput[]): void {
  console.log("\n=== Categorizing Outputs ===\n");

  const results = {
    storage: [] as UploadFile[],
    streaming: [] as UploadFile[],
    custom: [] as TypedOutput[],
  };

  for (const output of outputs) {
    // Use type guards for built-in types
    if (isStorageOutputV1(output)) {
      results.storage.push(output.data);
    } else if (isStreamingInputV1(output)) {
      results.streaming.push(output.data);
    } else if (output.nodeType) {
      // Custom types
      results.custom.push(output);
    }
  }

  console.log(`Storage outputs: ${results.storage.length}`);
  console.log(`Streaming outputs: ${results.streaming.length}`);
  console.log(`Custom outputs: ${results.custom.length}`);

  // Now process custom types with custom type guards
  for (const customOutput of results.custom) {
    // Apply custom type guards here
    // if (isThumbnailOutput(customOutput)) { ... }
    // if (isDescriptionOutput(customOutput)) { ... }
    console.log(`Custom type: ${customOutput.nodeType}`);
  }
}

/**
 * Example 4: Using type guards vs generic isStorageOutput
 *
 * This shows the difference between the generic type guard and built-in type guards.
 */
export function exampleBeforeAfter(outputs: TypedOutput[]): void {
  console.log("\n=== Type Guard Comparison ===\n");

  // Using the generic isStorageOutput (works with any storage output)
  console.log("Generic isStorageOutput:");
  for (const output of outputs) {
    if (isStorageOutput(output)) {
      console.log("Storage (generic):", output.data.url);
    }
  }

  // Using the specific isStorageOutputV1 (built-in type guard)
  console.log("\nSpecific isStorageOutputV1:");
  for (const output of outputs) {
    if (isStorageOutputV1(output)) {
      console.log("Storage (v1 specific):", output.data.url);
    }
  }
}

/**
 * Example 5: Type-safe extraction with type guards
 *
 * Extract data from built-in types using type guards.
 */
export function exampleTypeSafeExtraction(
  outputs: TypedOutput[],
): UploadFile[] {
  console.log("\n=== Type-Safe Extraction ===\n");

  const storageFiles: UploadFile[] = [];

  for (const output of outputs) {
    // Use type guard for narrowing
    if (isStorageOutputV1(output)) {
      // TypeScript knows output.data is UploadFile
      storageFiles.push(output.data);
    }
  }

  console.log(`Extracted ${storageFiles.length} storage files`);
  return storageFiles;
}

/**
 * Example 6: Working with arrays - filter and map
 *
 * Demonstrates type guards with array methods.
 */
export function exampleArrayOperations(outputs: TypedOutput[]): void {
  console.log("\n=== Array Operations with Type Guards ===\n");

  // Filter for storage outputs using the type guard
  const storageOutputs = outputs.filter(isStorageOutputV1);

  // Now TypeScript knows storageOutputs have UploadFile data
  const urls = storageOutputs.map((output) => output.data.url ?? "unknown");
  const sizes = storageOutputs.map((output) => output.data.size ?? 0);

  console.log(`URLs: ${urls.join(", ")}`);
  console.log(
    `Total size: ${sizes.reduce((sum, size) => sum + size, 0)} bytes`,
  );
}

/**
 * Main demo function that runs all examples
 */
export function runTypeGuardsDemo(): void {
  // Create sample outputs
  const sampleOutputs: TypedOutput[] = [
    {
      nodeId: "storage-1",
      nodeType: "storage-output-v1",
      data: {
        id: "file-1",
        url: "https://cdn.example.com/file1.jpg",
        size: 1024000,
        storage: {
          id: "storage-1",
          type: "s3",
          bucket: "my-bucket",
        },
        offset: 0,
      },
      timestamp: "2024-01-15T10:30:00Z",
    },
    {
      nodeId: "input-1",
      nodeType: "streaming-input-v1",
      data: {
        id: "file-2",
        url: "https://cdn.example.com/file2.jpg",
        size: 2048000,
        storage: {
          id: "storage-1",
          type: "s3",
          bucket: "my-bucket",
        },
        offset: 0,
      },
      timestamp: "2024-01-15T10:31:00Z",
    },
  ];

  console.log("\n========================================");
  console.log("  Type Guards Demo");
  console.log("========================================\n");

  exampleAutomaticNarrowing(sampleOutputs);
  exampleCustomTypeGuards(sampleOutputs);
  exampleHybridApproach(sampleOutputs);
  exampleBeforeAfter(sampleOutputs);
  exampleTypeSafeExtraction(sampleOutputs);
  exampleArrayOperations(sampleOutputs);

  console.log("\n========================================");
  console.log("  Demo Complete!");
  console.log("========================================\n");
}

// Uncomment to run the demo:
// runTypeGuardsDemo();
