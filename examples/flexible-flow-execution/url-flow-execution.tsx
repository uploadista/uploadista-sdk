/**
 * Example: URL-based Flow Execution
 *
 * This example demonstrates how to use the flexible flow execution API
 * to process images from external URLs without requiring file uploads.
 *
 * Use case: Allow users to provide image URLs for processing instead of
 * uploading files manually. Useful for importing images from other services,
 * social media, etc.
 */

import { useFlowExecution, useUploadistaClient } from "@uploadista/client-react";
import { useState } from "react";

export function UrlImageProcessor() {
  const client = useUploadistaClient();
  const [url, setUrl] = useState("");

  /**
   * Use the generic useFlowExecution hook with URL input type.
   * The inputBuilder transforms the URL string into flow input format.
   */
  const execution = useFlowExecution<string>({
    flowConfig: {
      flowId: "image-optimization-flow",
      storageId: "s3-production",
    },

    /**
     * Input builder: transforms URL string into flow inputs.
     * Automatically discovers the input node and creates the URL operation.
     */
    inputBuilder: async (imageUrl) => {
      // Auto-discover the input node (for single-input flows)
      const { inputNodes, single } = await client.findInputNode(
        "image-optimization-flow",
      );

      if (!single) {
        throw new Error("This example requires a single-input flow");
      }

      const inputNodeId = inputNodes[0].id;

      // Return flow inputs with URL operation
      return {
        [inputNodeId]: {
          operation: "url",
          url: imageUrl,
          storageId: "s3-production",
          metadata: {
            source: "external-url",
            providedBy: "user",
          },
        },
      };
    },

    /**
     * Success handler receives typed outputs from all output nodes
     */
    onSuccess: (outputs) => {
      console.log("Flow completed successfully!");

      // Access storage outputs
      for (const output of outputs) {
        if (output.nodeType === "storage-output-v1") {
          console.log("Optimized image saved:", output.data);
          // Output shape: { id, url, storage: { id, name }, size, ... }
        }
      }
    },

    /**
     * Error handler for failures
     */
    onError: (error) => {
      console.error("Flow execution failed:", error.message);

      // Common errors:
      // - Invalid URL format
      // - URL fetch failed (404, timeout, etc.)
      // - File type not supported
      // - Processing node errors
    },
  });

  return (
    <div className="url-processor">
      <h2>Process Image from URL</h2>

      {/* URL Input */}
      <div>
        <label>
          Image URL:
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/image.jpg"
            disabled={execution.isExecuting}
          />
        </label>

        <button
          onClick={() => execution.execute(url)}
          disabled={!url || execution.isExecuting}
        >
          Process Image
        </button>
      </div>

      {/* Processing Status */}
      {execution.isProcessing && (
        <div className="status">
          <p>Processing image from URL...</p>

          {execution.state.currentNodeName && (
            <p>Current step: {execution.state.currentNodeName}</p>
          )}
        </div>
      )}

      {/* Success State */}
      {execution.state.status === "success" && execution.state.flowOutputs && (
        <div className="success">
          <h3>Processing Complete!</h3>

          <div className="outputs">
            {execution.state.flowOutputs.map((output) => (
              <div key={output.nodeId} className="output">
                <strong>{output.nodeId}:</strong>
                <pre>{JSON.stringify(output.data, null, 2)}</pre>
              </div>
            ))}
          </div>

          <button onClick={execution.reset}>Process Another</button>
        </div>
      )}

      {/* Error State */}
      {execution.state.status === "error" && (
        <div className="error">
          <p>Error: {execution.state.error?.message}</p>
          <button onClick={execution.reset}>Try Again</button>
        </div>
      )}

      {/* Cancel Button */}
      {execution.isExecuting && (
        <button onClick={execution.abort}>Cancel</button>
      )}
    </div>
  );
}

/**
 * Example: Comparing traditional file upload vs URL fetch
 */
export function FlexibleImageProcessor() {
  const client = useUploadistaClient();
  const [mode, setMode] = useState<"file" | "url">("file");

  /**
   * Generic execution hook that supports both File and URL inputs.
   * The inputBuilder switches behavior based on input type.
   */
  const execution = useFlowExecution<File | string>({
    flowConfig: {
      flowId: "image-optimization-flow",
      storageId: "s3-production",
    },

    inputBuilder: async (input) => {
      const { inputNodes } = await client.findInputNode(
        "image-optimization-flow",
      );
      const inputNodeId = inputNodes[0].id;

      // Detect input type and create appropriate operation
      if (typeof input === "string") {
        // URL input
        return {
          [inputNodeId]: {
            operation: "url",
            url: input,
            storageId: "s3-production",
            metadata: { source: "external-url" },
          },
        };
      }

      // File input
      return {
        [inputNodeId]: {
          operation: "init",
          storageId: "s3-production",
          metadata: {
            originalName: input.name,
            mimeType: input.type,
            size: input.size,
          },
        },
      };
    },

    onSuccess: (outputs) => {
      console.log("Processed:", outputs);
    },
  });

  return (
    <div>
      <h2>Flexible Image Processor</h2>

      {/* Mode Selection */}
      <div>
        <label>
          <input
            type="radio"
            checked={mode === "file"}
            onChange={() => setMode("file")}
          />
          Upload File
        </label>

        <label>
          <input
            type="radio"
            checked={mode === "url"}
            onChange={() => setMode("url")}
          />
          Use URL
        </label>
      </div>

      {/* Input UI based on mode */}
      {mode === "file" ? (
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) execution.execute(file);
          }}
        />
      ) : (
        <input
          type="url"
          placeholder="https://example.com/image.jpg"
          onBlur={(e) => {
            if (e.target.value) execution.execute(e.target.value);
          }}
        />
      )}

      {/* Status Display */}
      {execution.isExecuting && <div>Processing...</div>}
      {execution.state.status === "success" && <div>Success!</div>}
    </div>
  );
}
