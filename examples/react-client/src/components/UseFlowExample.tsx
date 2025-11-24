import type { UploadFile } from "@uploadista/core";
import type { TypedOutput } from "@uploadista/core/flow";
import {
  FlowInput,
  type FlowInputMetadata,
  type InputExecutionState,
  useFlow,
} from "@uploadista/react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { FilePreview } from "./FilePreview";
import { Card } from "./ui/card";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

// All available flows from @uploadista/example-flows
type FlowId =
  // Basic Image Flows
  | "simple-flow"
  | "optimize-flow"
  | "resize-flow"
  | "transform-flow"
  // Advanced Image Flows
  | "describe-image-flow"
  | "remove-background-flow"
  // Video Flows
  | "transcode-video-flow"
  | "trim-video-flow"
  | "thumbnail-flow"
  | "resize-video-flow"
  | "describe-video-flow"
  // Utility Flows
  | "conditional-flow"
  | "merge-flow"
  | "multiplex-flow"
  | "zip-flow"
  // Complex Flows
  | "image-pipeline-flow"
  | "video-pipeline-flow"
  | "conditional-image-flow"
  | "multi-format-flow";

type FlowCategory =
  | "basic-image"
  | "advanced-image"
  | "video"
  | "utility"
  | "complex";

type FlowMetadata = {
  title: string;
  description: string;
  category: FlowCategory;
  acceptedTypes: string;
  hasMultipleInputs?: boolean;
};

const flowDescriptions: Record<FlowId, FlowMetadata> = {
  // Basic Image Flows
  "simple-flow": {
    title: "Simple Flow",
    description:
      "Basic file upload without any processing. Accepts a file and stores it directly.",
    category: "basic-image",
    acceptedTypes: "image/*",
  },
  "optimize-flow": {
    title: "Image Optimization",
    description:
      "Compresses and converts images to WebP format at 80% quality for web delivery.",
    category: "basic-image",
    acceptedTypes: "image/*",
  },
  "resize-flow": {
    title: "Image Resize",
    description:
      "Resizes images to 800x600 with cover fit, maintaining aspect ratio.",
    category: "basic-image",
    acceptedTypes: "image/*",
  },
  "transform-flow": {
    title: "Image Transform",
    description:
      "Applies transformations like rotation (90°) and horizontal flipping.",
    category: "basic-image",
    acceptedTypes: "image/*",
  },

  // Advanced Image Flows
  "describe-image-flow": {
    title: "Image Description (AI)",
    description:
      "Uses AI to generate detailed descriptions of image content for accessibility and metadata.",
    category: "advanced-image",
    acceptedTypes: "image/*",
  },
  "remove-background-flow": {
    title: "Remove Background (AI)",
    description:
      "Uses AI to remove backgrounds from images, outputting transparent PNGs.",
    category: "advanced-image",
    acceptedTypes: "image/*",
  },

  // Video Flows
  "transcode-video-flow": {
    title: "Video Transcode",
    description:
      "Converts videos to WebM format with VP9 codec for web-friendly playback.",
    category: "video",
    acceptedTypes: "video/*",
  },
  "trim-video-flow": {
    title: "Video Trim",
    description:
      "Cuts videos to specified time range (5-30 seconds) for clips or previews.",
    category: "video",
    acceptedTypes: "video/*",
  },
  "thumbnail-flow": {
    title: "Video Thumbnail",
    description:
      "Extracts a frame from video at 10 seconds as a JPEG thumbnail.",
    category: "video",
    acceptedTypes: "video/*",
  },
  "resize-video-flow": {
    title: "Video Resize",
    description: "Resizes videos to 720p (1280x720) while maintaining quality.",
    category: "video",
    acceptedTypes: "video/*",
  },
  "describe-video-flow": {
    title: "Video Description (AI)",
    description:
      "Uses AI to analyze video content and generate searchable descriptions.",
    category: "video",
    acceptedTypes: "video/*",
  },

  // Utility Flows
  "conditional-flow": {
    title: "Conditional Routing",
    description:
      "Routes files to different outputs based on size (>1MB to large, ≤1MB to small).",
    category: "utility",
    acceptedTypes: "image/*",
  },
  "merge-flow": {
    title: "Merge Files",
    description:
      "Combines multiple input files into a single processing stream for batch operations.",
    category: "utility",
    acceptedTypes: "*",
    hasMultipleInputs: true,
  },
  "multiplex-flow": {
    title: "Multiplex",
    description:
      "Splits a single input into 3 parallel processing paths for multiple versions.",
    category: "utility",
    acceptedTypes: "image/*",
  },
  "zip-flow": {
    title: "Zip Archive",
    description:
      "Archives multiple files into a single compressed ZIP file for download.",
    category: "utility",
    acceptedTypes: "*",
    hasMultipleInputs: true,
  },

  // Complex Flows
  "image-pipeline-flow": {
    title: "Image Pipeline",
    description:
      "Multi-stage processing: resize to 1200x900, optimize to WebP, and generate AI description.",
    category: "complex",
    acceptedTypes: "image/*",
  },
  "video-pipeline-flow": {
    title: "Video Pipeline",
    description:
      "Complete video processing: trim to 60s, transcode to WebM, and generate thumbnail.",
    category: "complex",
    acceptedTypes: "video/*",
  },
  "conditional-image-flow": {
    title: "Conditional Image Processing",
    description:
      "Routes images >2MB through resize+optimize, smaller images through optimize only.",
    category: "complex",
    acceptedTypes: "image/*",
  },
  "multi-format-flow": {
    title: "Multi-Format Export",
    description:
      "Generates WebP, JPEG, and PNG versions, then zips them into a single archive.",
    category: "complex",
    acceptedTypes: "image/*",
  },
};

const categoryLabels: Record<FlowCategory, string> = {
  "basic-image": "Basic Image Flows",
  "advanced-image": "Advanced Image Flows (AI)",
  video: "Video Flows",
  utility: "Utility Flows",
  complex: "Complex Flows",
};

// Group flows by category
const flowsByCategory = Object.entries(flowDescriptions).reduce(
  (acc, [flowId, metadata]) => {
    if (!acc[metadata.category]) {
      acc[metadata.category] = [];
    }
    acc[metadata.category].push({ flowId: flowId as FlowId, ...metadata });
    return acc;
  },
  {} as Record<FlowCategory, Array<{ flowId: FlowId } & FlowMetadata>>,
);

function UseFlowContent() {
  const [flowId, setFlowId] = useState<FlowId>("optimize-flow");
  const [outputs, setOutputs] = useState<TypedOutput[]>([]);
  const [inputValues, setInputValues] = useState<Record<string, File | string>>(
    {},
  );

  const flowData = useMemo(() => flowDescriptions[flowId], [flowId]);

  const flow = useFlow({
    flowConfig: {
      flowId,
      storageId: "local",
    },
    onSuccess: (result: TypedOutput[]) => {
      console.log("Flow complete:", result);
      setOutputs(result);
    },
    onError: (error: Error) => {
      console.error("Flow failed:", error);
    },
  });

  useEffect(() => {
    console.log("flow.inputMetadata", flow.inputMetadata);
  }, [flow.inputMetadata]);

  const handleFlowIdChange = (value: string) => {
    setFlowId(value as FlowId);
    setOutputs([]);
    setInputValues({});
    flow.reset();
  };

  const handleInputChange = (nodeId: string, value: File | string) => {
    setInputValues((prev) => ({ ...prev, [nodeId]: value }));
    flow.setInput(nodeId, value);
  };

  const handleExecute = () => {
    if (flow.inputMetadata && flow.inputMetadata.length === 1) {
      // Single input - use convenience upload method if it's a file
      const firstInput = flow.inputMetadata[0];
      if (firstInput) {
        const value = inputValues[firstInput.nodeId];
        if (value instanceof File) {
          flow.upload(value);
        } else {
          // For URL inputs, use execute
          flow.execute().catch((error: Error) => {
            console.error("Execute failed:", error);
          });
        }
      }
    } else {
      // Multiple inputs - use execute
      flow.execute().catch((error: Error) => {
        console.error("Execute failed:", error);
      });
    }
  };

  const allInputsProvided = flow.inputMetadata?.every(
    (input: FlowInputMetadata) => input.nodeId in flow.inputs,
  );

  const canExecute = allInputsProvided && !flow.isUploading;

  return (
    <Card className="p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">
          useFlow Hook Example
        </h2>
        <p className="text-gray-600 leading-relaxed mb-6">
          Demonstrates the new useFlow hook with automatic input discovery and
          support for single or multiple input flows.
        </p>

        <div className="space-y-2">
          <Label htmlFor="flow-select">Flow</Label>
          <Select value={flowId} onValueChange={handleFlowIdChange}>
            <SelectTrigger id="flow-select" className="w-full max-w-md">
              <SelectValue placeholder="Select a flow" />
            </SelectTrigger>
            <SelectContent>
              {(
                Object.entries(flowsByCategory) as [
                  FlowCategory,
                  Array<{ flowId: FlowId } & FlowMetadata>,
                ][]
              ).map(([category, flows]) => (
                <SelectGroup key={category}>
                  <SelectLabel>{categoryLabels[category]}</SelectLabel>
                  {flows.map(({ flowId, title }) => (
                    <SelectItem key={flowId} value={flowId}>
                      {title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">
          {flowData.title}
        </h3>
        <p className="text-gray-600 leading-relaxed">{flowData.description}</p>
      </div>

      <div className="space-y-6">
        {/* Input Discovery Status */}
        {flow.isDiscoveringInputs && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600" />
              <p className="text-sm font-medium text-gray-700">
                Discovering flow inputs...
              </p>
            </div>
          </div>
        )}

        {/* Input Fields (auto-discovered) */}
        {flow.inputMetadata &&
          flow.inputMetadata.length > 0 &&
          !flow.isUploading && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold text-gray-900">
                  {flow.inputMetadata.length === 1
                    ? "Flow Input"
                    : "Flow Inputs"}
                </h4>
                <span className="text-sm text-gray-500">
                  {flow.inputMetadata.length} input
                  {flow.inputMetadata.length > 1 ? "s" : ""} discovered
                </span>
              </div>

              {flow.inputMetadata.map((input: FlowInputMetadata) => (
                <div
                  key={input.nodeId}
                  className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200"
                >
                  <FlowInput
                    input={input}
                    accept={flowData.acceptedTypes}
                    allowUrl={true}
                    value={inputValues[input.nodeId] ?? null}
                    onChange={(value) => handleInputChange(input.nodeId, value)}
                    disabled={flow.isUploading}
                  />
                </div>
              ))}

              {/* Execute Button */}
              <button
                type="button"
                onClick={handleExecute}
                disabled={!canExecute}
                className="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {!allInputsProvided
                  ? "Select files to continue"
                  : "Execute Flow"}
              </button>
            </div>
          )}

        {/* Upload Progress Section */}
        {flow.isUploadingFile && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="text-sm font-semibold text-gray-500 mb-2">
                  Status
                </div>
                <div>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-700">
                    Uploading
                  </span>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="text-sm font-semibold text-gray-500 mb-2">
                  Progress
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {flow.state.progress}%
                </div>
              </div>
            </div>

            {/* Upload Progress Bar */}
            <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 ease-out"
                style={{ width: `${flow.state.progress}%` }}
              />
            </div>

            {/* Abort Button */}
            <button
              type="button"
              onClick={flow.abort}
              className="w-full px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all shadow-md"
            >
              Abort Upload
            </button>
          </div>
        )}

        {/* Flow Processing Section */}
        {flow.isProcessing && (
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-6 border border-purple-100">
            <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
              <div className="text-sm font-semibold text-gray-500 mb-2">
                Status
              </div>
              <div>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-purple-100 text-purple-700">
                  Processing Flow
                </span>
              </div>
            </div>

            {/* Processing Animation */}
            <div className="w-full bg-gray-200 rounded-full h-3 mb-2 overflow-hidden">
              <div className="bg-purple-600 h-3 rounded-full animate-pulse w-full" />
            </div>

            {/* Current Node Info */}
            <p className="text-sm text-gray-700 mb-4">
              {flow.state.currentNodeName
                ? `Processing: ${flow.state.currentNodeName}`
                : "Processing flow..."}
            </p>

            {/* Per-Input State Tracking for Multi-Input Flows */}
            {flow.inputStates.size > 0 && (
              <div className="space-y-3 mb-4">
                <h4 className="text-sm font-semibold text-gray-900">
                  Per-Input Progress
                </h4>
                {Array.from(flow.inputStates.values()).map(
                  (inputState: InputExecutionState) => (
                    <div
                      key={inputState.nodeId}
                      className="bg-white rounded-lg p-3 border border-gray-200"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">
                          {inputState.nodeId}
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                          {inputState.status}
                        </span>
                      </div>
                      {inputState.status === "uploading" && (
                        <div>
                          <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-indigo-500 transition-all"
                              style={{ width: `${inputState.progress}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-600 mt-1">
                            {inputState.progress}%
                          </p>
                        </div>
                      )}
                    </div>
                  ),
                )}
              </div>
            )}

            {/* Abort Button */}
            <button
              type="button"
              onClick={flow.abort}
              className="w-full px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all shadow-md"
            >
              Abort Flow
            </button>
          </div>
        )}

        {/* Job ID */}
        {flow.state.jobId && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
            <div className="text-sm font-semibold text-blue-700 mb-1">
              Job ID
            </div>
            <code className="text-sm text-blue-900 font-mono break-all">
              {flow.state.jobId}
            </code>
          </div>
        )}

        {/* Success Message */}
        {flow.state.status === "success" && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-green-900 mb-1">
                  Flow Complete!
                </h3>
                <p className="text-green-700">
                  File processed successfully through {flowData.title}.
                </p>
              </div>
            </div>

            {/* File Preview */}
            {outputs.length > 0 && (
              <div className="mb-4">
                {outputs.map((output) => (
                  <Fragment key={output.nodeId}>
                    {output.nodeType === "storage-output-v1" && (
                      <FilePreview
                        result={output.data as UploadFile}
                        className="mb-4"
                      />
                    )}
                  </Fragment>
                ))}
              </div>
            )}

            {flow.state.flowOutputs && (
              <details className="bg-white rounded-xl border border-green-200 mb-4">
                <summary className="px-4 py-3 cursor-pointer font-semibold text-gray-700 hover:text-gray-900">
                  View Flow Result Details
                </summary>
                <pre className="px-4 pb-4 text-sm text-gray-800 overflow-auto font-mono">
                  {JSON.stringify(flow.state.flowOutputs, null, 2)}
                </pre>
              </details>
            )}

            <button
              type="button"
              onClick={() => {
                flow.reset();
                setOutputs([]);
                setInputValues({});
              }}
              className="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-md"
            >
              Upload Another File
            </button>
          </div>
        )}

        {/* Error Message */}
        {flow.state.status === "error" && flow.state.error && (
          <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl p-6 border border-red-200">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-500 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-red-900 mb-1">
                  Flow Failed
                </h3>
                <p className="text-red-700">{flow.state.error.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                flow.reset();
                setOutputs([]);
                setInputValues({});
              }}
              className="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-md"
            >
              Try Another File
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

export function UseFlowExample() {
  return <UseFlowContent />;
}
