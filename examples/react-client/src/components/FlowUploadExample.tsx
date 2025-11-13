import { useFlowUpload } from "@uploadista/react";
import { useMemo, useState } from "react";
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

function FlowUploadContent() {
  const [flowId, setFlowId] = useState<FlowId>("optimize-flow");

  const flowData = useMemo(() => flowDescriptions[flowId], [flowId]);

  const handleFlowIdChange = (value: string) => {
    setFlowId(value as FlowId);
  };

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const flowUpload = useFlowUpload({
    flowConfig: {
      flowId,
      storageId: "local",
    },
    onSuccess: (result) => {
      console.log("Flow upload complete:", result);
    },
    onError: (error) => {
      console.error("Flow upload failed:", error);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      flowUpload.upload(file);
    }
  };

  return (
    <Card className="p-8">
      <div className="mb-8">
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
        <h2 className="text-3xl font-bold text-gray-900 mb-3">
          Flow Upload with {flowData.title}
        </h2>
        <p className="text-gray-600 leading-relaxed">{flowData.description}</p>
      </div>

      <div className="space-y-6">
        {/* File Input */}
        <div>
          <label
            htmlFor="flow-file-input"
            className="block text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide"
          >
            Choose File
          </label>
          <input
            id="flow-file-input"
            type="file"
            accept={flowData.acceptedTypes}
            onChange={handleFileSelect}
            disabled={flowUpload.isUploading}
            className="block w-full text-gray-700 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:bg-gradient-to-r file:from-indigo-600 file:to-purple-600 file:text-white file:font-semibold file:cursor-pointer hover:file:from-indigo-700 hover:file:to-purple-700 file:transition-all file:shadow-md disabled:opacity-50 disabled:cursor-not-allowed border-2 border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Job ID */}
        {flowUpload.state.jobId && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100">
            <div className="text-sm font-semibold text-blue-700 mb-1">
              Job ID
            </div>
            <code className="text-sm text-blue-900 font-mono break-all">
              {flowUpload.state.jobId}
            </code>
          </div>
        )}

        {/* Upload Progress Section */}
        {flowUpload.isUploadingFile && (
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
                  {flowUpload.state.progress}%
                </div>
              </div>
            </div>

            {/* Upload Progress Bar */}
            <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
              <div
                className="absolute inset-y-0 left-0 progress-bar-gradient transition-all duration-300 ease-out"
                style={{ width: `${flowUpload.state.progress}%` }}
              />
            </div>

            {/* Abort Button */}
            <button
              type="button"
              onClick={flowUpload.abort}
              disabled={!flowUpload.isUploading}
              className="w-full px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              Abort Upload
            </button>
          </div>
        )}

        {/* Flow Processing Section */}
        {flowUpload.isProcessing && (
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
              {flowUpload.state.currentNodeName
                ? `Processing: ${flowUpload.state.currentNodeName}`
                : "Processing flow..."}
            </p>

            {/* Abort Button */}
            <button
              type="button"
              onClick={flowUpload.abort}
              disabled={!flowUpload.isUploading}
              className="w-full px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              Abort Flow
            </button>
          </div>
        )}

        {/* Success Message */}
        {flowUpload.state.status === "success" && (
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
            {uploadedFile && (
              <FilePreview
                file={uploadedFile}
                result={flowUpload.state.result}
                className="mb-4"
              />
            )}

            {flowUpload.state.result && (
              <details className="bg-white rounded-xl border border-green-200">
                <summary className="px-4 py-3 cursor-pointer font-semibold text-gray-700 hover:text-gray-900">
                  View Flow Result Details
                </summary>
                <pre className="px-4 pb-4 text-sm text-gray-800 overflow-auto font-mono">
                  {JSON.stringify(flowUpload.state.result, null, 2)}
                </pre>
              </details>
            )}
            <button
              type="button"
              onClick={flowUpload.reset}
              className="mt-4 w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-md"
            >
              Upload Another File
            </button>
          </div>
        )}

        {/* Error Message */}
        {flowUpload.state.status === "error" && flowUpload.state.error && (
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
                <p className="text-red-700">{flowUpload.state.error.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={flowUpload.reset}
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

export function FlowUploadExample() {
  return <FlowUploadContent />;
}
