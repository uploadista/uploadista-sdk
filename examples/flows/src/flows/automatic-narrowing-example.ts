import type { TypedOutput, UploadFile } from "@uploadista/core";
import { isStorageOutput } from "@uploadista/core";

/**
 * Automatic Type Narrowing Example
 *
 * This example demonstrates the difference between built-in types (automatic narrowing)
 * and custom types (require type guards) after the discriminated union improvement.
 */

/**
 * Example 1: Built-in types with automatic narrowing (NO type guards needed!)
 *
 * Built-in types ('storage-output-v1', 'streaming-input-v1') use discriminated
 * unions, which means TypeScript automatically narrows the type in switch statements.
 */
export function exampleAutomaticNarrowing(outputs: TypedOutput[]): void {
  console.log("=== Automatic Narrowing for Built-in Types ===\n");

  for (const output of outputs) {
    // ✅ Switch statement automatically narrows built-in types
    switch (output.nodeType) {
      case "storage-output-v1":
        // ✅ TypeScript knows output.data is UploadFile - NO type guard needed!
        console.log("Storage Output:");
        console.log(`  - URL: ${output.data.url}`);
        console.log(`  - Size: ${output.data.size} bytes`);
        console.log(`  - MIME: ${output.data.mimeType}`);
        console.log(`  - ID: ${output.data.id}`);
        break;

      case "streaming-input-v1":
        // ✅ TypeScript knows output.data is UploadFile - NO type guard needed!
        console.log("Input Output:");
        console.log(`  - URL: ${output.data.url}`);
        console.log(`  - Name: ${output.data.name}`);
        console.log(`  - Size: ${output.data.size} bytes`);
        break;

      default:
        // Custom types or untyped nodes fall through to default
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
    // Built-in types: automatic narrowing
    if (output.nodeType === "storage-output-v1") {
      console.log("Built-in (automatic):", output.data.url);
    }

    // Custom types: use type guards
    // Note: This example uses isStorageOutput to show the pattern
    // In real code, you'd use custom type guards like isThumbnailOutput
    else if (isStorageOutput(output)) {
      console.log("Custom (type guard):", output.data.url);
    }
  }
}

/**
 * Example 3: Hybrid approach - best of both worlds
 *
 * Use switch for built-in types, then fall back to type guards for custom types.
 * This gives you the best developer experience for both cases.
 */
export function exampleHybridApproach(outputs: TypedOutput[]): void {
  console.log("\n=== Hybrid Approach (Recommended) ===\n");

  const results = {
    storage: [] as UploadFile[],
    streaming: [] as UploadFile[],
    custom: [] as TypedOutput[],
  };

  for (const output of outputs) {
    // First, try automatic narrowing for built-in types
    switch (output.nodeType) {
      case "storage-output-v1":
        results.storage.push(output.data);
        break;

      case "streaming-input-v1":
        results.streaming.push(output.data);
        break;

      default:
        // For everything else (custom types), collect for type guard processing
        if (output.nodeType) {
          results.custom.push(output);
        }
    }
  }

  console.log(`Storage outputs: ${results.storage.length}`);
  console.log(`Streaming outputs: ${results.streaming.length}`);
  console.log(`Custom outputs: ${results.custom.length}`);

  // Now process custom types with type guards
  for (const customOutput of results.custom) {
    // Apply custom type guards here
    // if (isThumbnailOutput(customOutput)) { ... }
    // if (isDescriptionOutput(customOutput)) { ... }
    console.log(`Custom type: ${customOutput.nodeType}`);
  }
}

/**
 * Example 4: Before vs After comparison
 *
 * This shows the improvement in developer experience with discriminated unions.
 */
export function exampleBeforeAfter(outputs: TypedOutput[]): void {
  console.log("\n=== Before vs After Comparison ===\n");

  // BEFORE (required type guards for everything)
  console.log("BEFORE: Always needed type guards");
  for (const output of outputs) {
    if (isStorageOutput(output)) {
      // Type guard required even for built-in types
      console.log("Storage (with type guard):", output.data.url);
    }
  }

  // AFTER (automatic narrowing for built-in types)
  console.log("\nAFTER: Automatic narrowing for built-in types");
  for (const output of outputs) {
    switch (output.nodeType) {
      case "storage-output-v1":
        // ✅ No type guard needed!
        console.log("Storage (automatic):", output.data.url);
        break;
    }
  }
}

/**
 * Example 5: Type-safe extraction without type guards
 *
 * Extract data from built-in types without any type guards.
 */
export function exampleTypeSafeExtraction(outputs: TypedOutput[]): UploadFile[] {
  console.log("\n=== Type-Safe Extraction (No Type Guards) ===\n");

  const storageFiles: UploadFile[] = [];

  for (const output of outputs) {
    // ✅ Automatic narrowing - no type guard needed!
    if (output.nodeType === "storage-output-v1") {
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
 * Demonstrates automatic narrowing with array methods.
 */
export function exampleArrayOperations(outputs: TypedOutput[]): void {
  console.log("\n=== Array Operations with Automatic Narrowing ===\n");

  // Filter for storage outputs - automatic narrowing!
  const storageOutputs = outputs.filter(
    (output): output is Extract<TypedOutput, { nodeType: "storage-output-v1" }> =>
      output.nodeType === "storage-output-v1",
  );

  // Now TypeScript knows storageOutputs have UploadFile data
  const urls = storageOutputs.map((output) => output.data.url);
  const sizes = storageOutputs.map((output) => output.data.size);

  console.log(`URLs: ${urls.join(", ")}`);
  console.log(`Total size: ${sizes.reduce((sum, size) => sum + size, 0)} bytes`);
}

/**
 * Main demo function that runs all examples
 */
export function runAutomaticNarrowingDemo(): void {
  // Create sample outputs
  const sampleOutputs: TypedOutput[] = [
    {
      nodeId: "storage-1",
      nodeType: "storage-output-v1",
      data: {
        id: "file-1",
        url: "https://cdn.example.com/file1.jpg",
        size: 1024000,
        mimeType: "image/jpeg",
        name: "file1.jpg",
        uploadId: "upload-1",
        storage: {
          id: "storage-1",
          type: "s3",
          bucket: "my-bucket",
        },
        offset: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
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
        mimeType: "image/jpeg",
        name: "file2.jpg",
        uploadId: "upload-2",
        storage: {
          id: "storage-1",
          type: "s3",
          bucket: "my-bucket",
        },
        offset: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      timestamp: "2024-01-15T10:31:00Z",
    },
  ];

  console.log("\n========================================");
  console.log("  Automatic Type Narrowing Demo");
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
// runAutomaticNarrowingDemo();
