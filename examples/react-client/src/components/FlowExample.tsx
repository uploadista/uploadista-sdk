import type { UploadFile } from "@uploadista/core";
import type { TypedOutput } from "@uploadista/core/flow";
import {
  Flow,
  type FlowInputMetadata,
  useFlowContext,
} from "@uploadista/react";
import { Fragment, useMemo, useState } from "react";
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

// Custom component demonstrating useFlowContext() hook
function CustomFlowInputCard({
  input,
  accept,
}: {
  input: FlowInputMetadata;
  accept: string;
}) {
  const flow = useFlowContext();

  return (
    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h5 className="font-semibold text-gray-900">{input.nodeName}</h5>
        <span className="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-600">
          {input.nodeId}
        </span>
      </div>
      {input.nodeDescription && (
        <p className="text-sm text-gray-500 mb-4">{input.nodeDescription}</p>
      )}

      {/* Using Flow.Input to scope the context */}
      <Flow.Input nodeId={input.nodeId}>
        <Flow.Input.DropZone accept={accept}>
          {({ isDragging, getRootProps, getInputProps, openFilePicker }) => (
            <button
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors w-full ${
                isDragging
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-300 hover:border-indigo-400"
              }`}
              onClick={() => !flow.isUploading && openFilePicker()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !flow.isUploading) {
                  e.preventDefault();
                  openFilePicker();
                }
              }}
            >
              <input {...getInputProps()} />
              <p className="text-sm text-gray-600">
                {isDragging
                  ? "Drop file here..."
                  : "Click to select or drag & drop"}
              </p>
            </button>
          )}
        </Flow.Input.DropZone>

        {/* Show preview of selected file */}
        <Flow.Input.Preview>
          {({ value }) => (
            <>
              {value && (
                <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
                  <p className="text-sm font-medium text-gray-900">
                    {value instanceof File ? value.name : String(value)}
                  </p>
                  {value instanceof File && (
                    <p className="text-xs text-gray-500">
                      {(value.size / 1024).toFixed(1)} KB
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </Flow.Input.Preview>
      </Flow.Input>
    </div>
  );
}

export function FlowExample() {
  const [flowId, setFlowId] = useState<FlowId>("optimize-flow");
  const [outputs, setOutputs] = useState<TypedOutput[]>([]);

  const flowData = useMemo(() => flowDescriptions[flowId], [flowId]);

  const handleFlowIdChange = (value: string) => {
    setFlowId(value as FlowId);
    setOutputs([]);
  };

  return (
    <Card className="p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">
          useFlow Hook Example with Flow.Inputs
        </h2>
        <p className="text-gray-600 leading-relaxed mb-6">
          Demonstrates the Flow compound component with auto-discovery of inputs
          using Flow.Inputs and custom components with useFlowContext().
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

      {/* Using the Flow compound component with auto-discovery */}
      <Flow
        flowId={flowId}
        storageId="local"
        onSuccess={(result: TypedOutput[]) => {
          console.log("Flow complete:", result);
          setOutputs(result);
        }}
        onError={(error: Error) => {
          console.error("Flow failed:", error);
        }}
      >
        <div className="space-y-6">
          {/* Auto-discover and render inputs */}
          <Flow.Inputs>
            {({ inputs, isLoading }) => (
              <>
                {isLoading && (
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
                    <div className="flex items-center gap-3">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600" />
                      <p className="text-sm font-medium text-gray-700">
                        Discovering flow inputs...
                      </p>
                    </div>
                  </div>
                )}

                {inputs && inputs.length > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-semibold text-gray-900">
                        {inputs.length === 1 ? "Flow Input" : "Flow Inputs"}
                      </h4>
                      <span className="text-sm text-gray-500">
                        {inputs.length} input
                        {inputs.length > 1 ? "s" : ""} discovered
                      </span>
                    </div>

                    {/* Using custom component with useFlowContext */}
                    {inputs.map((input: FlowInputMetadata) => (
                      <CustomFlowInputCard
                        key={input.nodeId}
                        input={input}
                        accept={flowData.acceptedTypes}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </Flow.Inputs>

          {/* Submit Button */}
          <Flow.Submit className="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md">
            Execute Flow
          </Flow.Submit>

          {/* Upload Progress */}
          <Flow.Progress>
            {({ progress, status, bytesUploaded, totalBytes }) =>
              status === "uploading" && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-white rounded-xl p-4 shadow-sm">
                      <div className="text-sm font-semibold text-gray-500 mb-2">
                        Status
                      </div>
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-700">
                        Uploading
                      </span>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm">
                      <div className="text-sm font-semibold text-gray-500 mb-2">
                        Progress
                      </div>
                      <div className="text-2xl font-bold text-gray-900">
                        {progress}%
                      </div>
                      {totalBytes && (
                        <div className="text-xs text-gray-500">
                          {(bytesUploaded / 1024).toFixed(0)} KB /{" "}
                          {(totalBytes / 1024).toFixed(0)} KB
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="flex gap-3">
                    <Flow.Pause className="flex-1 px-6 py-3 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 focus:outline-none focus:ring-4 focus:ring-amber-100 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                      Pause Upload
                    </Flow.Pause>
                    <Flow.Cancel className="flex-1 px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all shadow-md">
                      Abort Upload
                    </Flow.Cancel>
                  </div>
                </div>
              )
            }
          </Flow.Progress>

          {/* Processing Status */}
          <Flow.Status>
            {({ status, currentNodeName }) =>
              status === "processing" && (
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-6 border border-purple-100">
                  <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
                    <div className="text-sm font-semibold text-gray-500 mb-2">
                      Status
                    </div>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-purple-100 text-purple-700">
                      Processing Flow
                    </span>
                  </div>

                  <div className="w-full bg-gray-200 rounded-full h-3 mb-2 overflow-hidden">
                    <div className="bg-purple-600 h-3 rounded-full animate-pulse w-full" />
                  </div>

                  <p className="text-sm text-gray-700 mb-4">
                    {currentNodeName
                      ? `Processing: ${currentNodeName}`
                      : "Processing flow..."}
                  </p>

                  <div className="flex gap-3">
                    <Flow.Pause className="flex-1 px-6 py-3 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 focus:outline-none focus:ring-4 focus:ring-amber-100 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed">
                      Pause Flow
                    </Flow.Pause>
                    <Flow.Cancel className="flex-1 px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all shadow-md">
                      Abort Flow
                    </Flow.Cancel>
                  </div>
                </div>
              )
            }
          </Flow.Status>

          {/* Paused State */}
          <Flow.Status>
            {({ status }) =>
              status === "paused" && (
                <div className="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-2xl p-6 border border-amber-200">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center">
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
                          d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-amber-900 mb-1">
                        Upload Paused
                      </h3>
                      <p className="text-amber-700">
                        The upload has been paused. Resume to continue.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Flow.Resume className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-700 hover:to-emerald-700 focus:outline-none focus:ring-4 focus:ring-green-100 transition-all shadow-md">
                      Resume
                    </Flow.Resume>
                    <Flow.Cancel className="flex-1 px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all shadow-md">
                      Cancel
                    </Flow.Cancel>
                  </div>
                </div>
              )
            }
          </Flow.Status>

          {/* Success */}
          <Flow.Status>
            {({ status }) =>
              status === "success" && (
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

                  {outputs.length > 0 && (
                    <details className="bg-white rounded-xl border border-green-200 mb-4">
                      <summary className="px-4 py-3 cursor-pointer font-semibold text-gray-700 hover:text-gray-900">
                        View Flow Result Details
                      </summary>
                      <pre className="px-4 pb-4 text-sm text-gray-800 overflow-auto font-mono">
                        {JSON.stringify(outputs, null, 2)}
                      </pre>
                    </details>
                  )}

                  <Flow.Reset className="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-md">
                    Upload Another File
                  </Flow.Reset>
                </div>
              )
            }
          </Flow.Status>

          {/* Error */}
          <Flow.Error>
            {({ error }) =>
              error && (
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
                      <p className="text-red-700">{error.message}</p>
                    </div>
                  </div>
                  <Flow.Reset className="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-md">
                    Try Another File
                  </Flow.Reset>
                </div>
              )
            }
          </Flow.Error>
        </div>
      </Flow>
    </Card>
  );
}
