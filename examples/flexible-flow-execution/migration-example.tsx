/**
 * Migration Example: from useFlowUpload to useFlowExecution
 *
 * This file shows side-by-side comparisons of the old and new patterns,
 * helping developers migrate to the more flexible useFlowExecution hook.
 */

import {
  useFlowExecution,
  useFlowUpload,
  useUploadistaClient,
} from "@uploadista/client-react";
import { useState } from "react";

/**
 * BEFORE: Traditional file upload with useFlowUpload
 * Works great for file-only uploads, but limited to File/Blob inputs
 */
export function BeforeExample_TraditionalFileUpload() {
  const flowUpload = useFlowUpload({
    flowConfig: {
      flowId: "image-resize-flow",
      storageId: "s3-production",
    },
    onSuccess: (outputs) => {
      console.log("File processed:", outputs);
    },
    onError: (error) => {
      console.error("Upload failed:", error);
    },
  });

  return (
    <div>
      <h3>Traditional File Upload (useFlowUpload)</h3>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) flowUpload.upload(file);
        }}
      />

      {flowUpload.isUploading && (
        <div>Uploading... {Math.round(flowUpload.state.progress)}%</div>
      )}

      {flowUpload.isProcessing && <div>Processing image...</div>}

      {flowUpload.state.status === "success" && <div>Success!</div>}
    </div>
  );
}

/**
 * AFTER: Same functionality with useFlowExecution
 * More verbose but provides flexibility for future enhancements
 */
export function AfterExample_FileUploadWithNewHook() {
  const client = useUploadistaClient();

  const execution = useFlowExecution<File>({
    flowConfig: {
      flowId: "image-resize-flow",
      storageId: "s3-production",
    },

    // Transform File into flow input format
    inputBuilder: async (file) => {
      const { inputNodes } = await client.findInputNode("image-resize-flow");

      return {
        [inputNodes[0].id]: {
          operation: "init",
          storageId: "s3-production",
          metadata: {
            originalName: file.name,
            mimeType: file.type,
            size: file.size,
          },
        },
      };
    },

    onSuccess: (outputs) => {
      console.log("File processed:", outputs);
    },

    onError: (error) => {
      console.error("Upload failed:", error);
    },
  });

  return (
    <div>
      <h3>File Upload with useFlowExecution (New)</h3>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) execution.execute(file);
        }}
      />

      {execution.isUploadingFile && (
        <div>Uploading... {Math.round(execution.state.progress)}%</div>
      )}

      {execution.isProcessing && <div>Processing image...</div>}

      {execution.state.status === "success" && <div>Success!</div>}
    </div>
  );
}

/**
 * WHY MIGRATE: Adding URL support
 * The useFlowUpload hook can't handle URLs - you'd need a completely separate implementation.
 * With useFlowExecution, you can easily extend to support multiple input types.
 */
export function WhyMigrate_URLSupport() {
  const client = useUploadistaClient();
  const [mode, setMode] = useState<"file" | "url">("file");

  // Single hook handles both file uploads and URL fetches!
  const execution = useFlowExecution<File | string>({
    flowConfig: {
      flowId: "image-resize-flow",
      storageId: "s3-production",
    },

    inputBuilder: async (input) => {
      const { inputNodes } = await client.findInputNode("image-resize-flow");
      const nodeId = inputNodes[0].id;

      // Different logic based on input type
      if (typeof input === "string") {
        // URL input
        return {
          [nodeId]: {
            operation: "url",
            url: input,
            storageId: "s3-production",
            metadata: { source: "url" },
          },
        };
      }

      // File input
      return {
        [nodeId]: {
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
      <h3>Flexible Input (File OR URL)</h3>

      {/* Switch between modes */}
      <div>
        <button onClick={() => setMode("file")}>Upload File</button>
        <button onClick={() => setMode("url")}>Use URL</button>
      </div>

      {/* Different UI based on mode */}
      {mode === "file" ? (
        <input
          type="file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) execution.execute(file);
          }}
        />
      ) : (
        <div>
          <input
            type="url"
            placeholder="https://example.com/image.jpg"
            onBlur={(e) => {
              if (e.target.value) execution.execute(e.target.value);
            }}
          />
        </div>
      )}

      {/* Unified status display */}
      {execution.isExecuting && (
        <div>
          {execution.isUploadingFile && `Uploading... ${Math.round(execution.state.progress)}%`}
          {execution.isProcessing && "Processing..."}
        </div>
      )}

      {execution.state.status === "success" && <div>Success!</div>}
    </div>
  );
}

/**
 * ADVANCED: Custom input types
 * useFlowExecution enables completely custom input types beyond File and URL
 */
interface CustomImageData {
  source: "camera" | "library" | "clipboard";
  dataUrl: string;
  metadata: {
    timestamp: Date;
    location?: { lat: number; lon: number };
  };
}

export function AdvancedExample_CustomInputType() {
  const client = useUploadistaClient();

  const execution = useFlowExecution<CustomImageData>({
    flowConfig: {
      flowId: "image-resize-flow",
      storageId: "s3-production",
    },

    inputBuilder: async (customData) => {
      const { inputNodes } = await client.findInputNode("image-resize-flow");

      // Convert data URL to blob, then create init operation
      const blob = await fetch(customData.dataUrl).then((r) => r.blob());

      return {
        [inputNodes[0].id]: {
          operation: "init",
          storageId: "s3-production",
          metadata: {
            source: customData.source,
            timestamp: customData.metadata.timestamp.toISOString(),
            location: customData.metadata.location,
            mimeType: blob.type,
            size: blob.size,
          },
        },
      };
    },

    onSuccess: (outputs) => {
      console.log("Custom data processed:", outputs);
    },
  });

  const handleCameraCapture = async () => {
    // Simulated camera capture
    const customData: CustomImageData = {
      source: "camera",
      dataUrl: "data:image/jpeg;base64,...",
      metadata: {
        timestamp: new Date(),
        location: { lat: 40.7128, lon: -74.006 },
      },
    };

    execution.execute(customData);
  };

  return (
    <div>
      <h3>Custom Input Type (Camera, Library, Clipboard)</h3>
      <button onClick={handleCameraCapture}>Capture from Camera</button>
      {/* More input sources... */}
    </div>
  );
}

/**
 * MIGRATION CHECKLIST:
 *
 * 1. ✅ Keep using useFlowUpload if you only need file uploads
 *    - No changes needed
 *    - Works perfectly as-is
 *
 * 2. ✅ Migrate to useFlowExecution if you need:
 *    - URL-based file processing
 *    - Multiple input types (file + URL + custom)
 *    - Structured data inputs
 *    - Multi-input flows (future)
 *
 * 3. ✅ Migration steps:
 *    a. Add useUploadistaClient() to access client
 *    b. Replace useFlowUpload with useFlowExecution
 *    c. Add inputBuilder function
 *    d. Update execute call (execution.execute(file) instead of upload(file))
 *    e. Update state checks (isUploadingFile instead of isUploading)
 *
 * 4. ✅ Benefits:
 *    - Support URL inputs without separate code
 *    - Prepare for multi-input flows
 *    - Custom input type validation
 *    - More flexible for future features
 */
