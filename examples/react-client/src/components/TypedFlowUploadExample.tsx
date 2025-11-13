import {
  filterOutputsByType,
  hasOutputOfType,
  isStorageOutput,
  type TypedOutput,
  type UploadFile,
} from "@uploadista/core";
import { useFlowUpload } from "@uploadista/react";
import { useState } from "react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Label } from "./ui/label";
import { FilePreview } from "./FilePreview";

/**
 * Typed Flow Upload Example
 *
 * Demonstrates how to use the typed flow system with type-safe output handling.
 * This example shows:
 * - Using onFlowComplete to access all typed outputs
 * - Type guards for safe type narrowing
 * - Filtering outputs by type
 * - Progressive enhancement (handling both typed and untyped flows)
 * - TypeScript type safety throughout
 */

interface OutputDisplay {
  nodeId: string;
  nodeType?: string;
  dataPreview: string;
  timestamp: string;
}

export function TypedFlowUploadExample() {
  const [file, setFile] = useState<File | null>(null);
  const [allOutputs, setAllOutputs] = useState<TypedOutput[]>([]);
  const [outputsDisplay, setOutputsDisplay] = useState<OutputDisplay[]>([]);
  const [storageUrls, setStorageUrls] = useState<string[]>([]);

  const { state, upload, abort, reset } = useFlowUpload<UploadFile>({
    flowConfig: {
      // Use the multi-output flow from our examples
      flowId: "complex-typed-flow",
      storageId: "example-storage",
    },

    /**
     * NEW: onFlowComplete callback receives all typed outputs
     * Each output includes: nodeId, nodeType (optional), data, timestamp
     */
    onFlowComplete: (outputs: TypedOutput[]) => {
      console.log(`Flow completed with ${outputs.length} outputs`);

      // Save all outputs for display
      setAllOutputs(outputs);

      // Create display-friendly output information
      const displays: OutputDisplay[] = outputs.map((output) => ({
        nodeId: output.nodeId,
        nodeType: output.nodeType,
        dataPreview: JSON.stringify(output.data, null, 2).substring(0, 200),
        timestamp: output.timestamp,
      }));
      setOutputsDisplay(displays);

      // Example 1: Filter outputs by type using type guards
      const storageOutputs = filterOutputsByType(outputs, isStorageOutput);
      console.log(`Found ${storageOutputs.length} storage outputs`);

      // Extract URLs from storage outputs (type-safe!)
      const urls = storageOutputs.map((output) => output.data.url);
      setStorageUrls(urls);

      // Example 2: Check if specific output types exist
      if (hasOutputOfType(outputs, isStorageOutput)) {
        console.log("✅ Storage output present");
      }

      // Example 3: Process each output by type
      for (const output of outputs) {
        // Type-safe access using type guards
        if (isStorageOutput(output)) {
          console.log("Storage output:", {
            url: output.data.url,
            size: output.data.size,
            mimeType: output.data.mimeType,
          });
        } else if (output.nodeType) {
          // Has type but not storage - handle other custom types
          console.log(`Custom output type: ${output.nodeType}`);
        } else {
          // No type information (legacy untyped node)
          console.log(`Untyped output from node: ${output.nodeId}`);
        }
      }

      // Example 4: Progressive enhancement (support both typed and untyped)
      const typedOutputs = outputs.filter((o) => o.nodeType);
      const untypedOutputs = outputs.filter((o) => !o.nodeType);

      if (typedOutputs.length > 0) {
        console.log("Using type-safe processing for typed outputs");
      }

      if (untypedOutputs.length > 0) {
        console.log("Fallback processing for untyped outputs");
      }
    },

    /**
     * Legacy onSuccess callback still works for backward compatibility
     * Receives the data from the first output (or specified outputNodeId)
     */
    onSuccess: (result) => {
      console.log("Single output (legacy callback):", result);
    },

    onError: (error) => {
      console.error("Upload failed:", error);
    },

    onProgress: (uploadId, bytesUploaded, totalBytes) => {
      const percent = totalBytes
        ? Math.round((bytesUploaded / totalBytes) * 100)
        : 0;
      console.log(`Progress: ${percent}%`);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      // Reset outputs when new file is selected
      setAllOutputs([]);
      setOutputsDisplay([]);
      setStorageUrls([]);
    }
  };

  const handleUpload = () => {
    if (file) {
      void upload(file);
    }
  };

  const handleReset = () => {
    reset();
    setFile(null);
    setAllOutputs([]);
    setOutputsDisplay([]);
    setStorageUrls([]);
  };

  const isUploading = state.status === "uploading" || state.status === "processing";

  return (
    <Card className="p-6 max-w-4xl mx-auto">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold mb-2">Typed Flow Upload Example</h2>
          <p className="text-gray-600">
            Upload a file and see how typed outputs work with type-safe access.
            This example uses the <code className="bg-gray-100 px-1 py-0.5 rounded">complex-typed-flow</code>{" "}
            which produces multiple typed outputs.
          </p>
        </div>

        {/* File Input */}
        <div className="space-y-2">
          <Label htmlFor="file-input">Select Image</Label>
          <input
            id="file-input"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={isUploading}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100
              disabled:opacity-50"
          />
        </div>

        {/* File Preview */}
        {file && <FilePreview file={file} />}

        {/* Controls */}
        <div className="flex gap-3">
          <Button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="flex-1"
          >
            {isUploading ? "Uploading..." : "Upload with Typed Flow"}
          </Button>

          {isUploading && (
            <Button onClick={abort} variant="outline">
              Cancel
            </Button>
          )}

          <Button onClick={handleReset} variant="outline">
            Reset
          </Button>
        </div>

        {/* Status */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Status:</span>
            <span
              className={`px-2 py-1 rounded text-sm ${
                state.status === "success"
                  ? "bg-green-100 text-green-800"
                  : state.status === "error"
                    ? "bg-red-100 text-red-800"
                    : state.status === "uploading" || state.status === "processing"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-gray-100 text-gray-800"
              }`}
            >
              {state.status}
            </span>
          </div>

          {state.progress > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{state.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${state.progress}%` }}
                />
              </div>
            </div>
          )}

          {state.currentNodeName && (
            <div className="text-sm text-gray-600">
              Current node: <span className="font-mono">{state.currentNodeName}</span>
              {state.currentNodeType && (
                <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">
                  {state.currentNodeType}
                </span>
              )}
            </div>
          )}

          {state.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              Error: {state.error.message}
            </div>
          )}
        </div>

        {/* Typed Outputs Display */}
        {outputsDisplay.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">
              Typed Outputs ({outputsDisplay.length})
            </h3>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-blue-50 rounded">
                <div className="text-2xl font-bold text-blue-700">
                  {allOutputs.length}
                </div>
                <div className="text-sm text-blue-600">Total Outputs</div>
              </div>
              <div className="p-4 bg-green-50 rounded">
                <div className="text-2xl font-bold text-green-700">
                  {allOutputs.filter((o) => o.nodeType).length}
                </div>
                <div className="text-sm text-green-600">Typed Outputs</div>
              </div>
              <div className="p-4 bg-purple-50 rounded">
                <div className="text-2xl font-bold text-purple-700">
                  {storageUrls.length}
                </div>
                <div className="text-sm text-purple-600">Storage Outputs</div>
              </div>
            </div>

            {/* Storage URLs */}
            {storageUrls.length > 0 && (
              <div className="p-4 bg-green-50 border border-green-200 rounded">
                <h4 className="font-semibold text-green-800 mb-2">
                  Storage URLs (Type-Safe Access)
                </h4>
                {storageUrls.map((url, index) => (
                  <div key={index} className="text-sm text-green-700 font-mono break-all">
                    {url}
                  </div>
                ))}
              </div>
            )}

            {/* Individual Outputs */}
            <div className="space-y-3">
              {outputsDisplay.map((output, index) => (
                <div
                  key={index}
                  className="p-4 border rounded space-y-2 bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Node ID:</span>
                    <code className="text-sm bg-white px-2 py-1 rounded">
                      {output.nodeId}
                    </code>
                    {output.nodeType && (
                      <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        {output.nodeType}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-gray-500">
                    Timestamp: {new Date(output.timestamp).toLocaleString()}
                  </div>

                  <details className="text-sm">
                    <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                      View Data Preview
                    </summary>
                    <pre className="mt-2 p-2 bg-white rounded overflow-x-auto text-xs">
                      {output.dataPreview}
                      {output.dataPreview.length >= 200 && "..."}
                    </pre>
                  </details>
                </div>
              ))}
            </div>

            {/* Code Example */}
            <div className="p-4 bg-gray-900 text-white rounded overflow-x-auto">
              <div className="text-xs font-mono space-y-1">
                <div className="text-gray-400">{"// Access typed outputs:"}</div>
                <div className="text-green-400">
                  const storage = filterOutputsByType(outputs, isStorageOutput);
                </div>
                <div className="text-blue-400">console.log(storage[0].data.url);</div>
                <div className="mt-2 text-gray-400">{"// Type guards work:"}</div>
                <div className="text-green-400">
                  {`if (isStorageOutput(output)) {`}
                </div>
                <div className="text-blue-400 pl-4">
                  {"  // TypeScript knows output.data is UploadFile"}
                </div>
                <div className="text-green-400">{"}"}</div>
              </div>
            </div>
          </div>
        )}

        {/* Help Text */}
        <div className="text-sm text-gray-600 space-y-2 p-4 bg-blue-50 rounded">
          <p className="font-semibold">How this works:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <code>onFlowComplete</code> receives all outputs as <code>TypedOutput[]</code>
            </li>
            <li>
              Each output has <code>nodeId</code>, optional <code>nodeType</code>,
              <code>data</code>, and <code>timestamp</code>
            </li>
            <li>
              Use type guards like <code>isStorageOutput(output)</code> for type-safe access
            </li>
            <li>
              Helper functions: <code>filterOutputsByType()</code>,{" "}
              <code>hasOutputOfType()</code>, etc.
            </li>
            <li>
              TypeScript automatically narrows types inside type guard blocks
            </li>
          </ul>
        </div>
      </div>
    </Card>
  );
}
