import { useFlowUpload } from "@uploadista/react";
import { useMemo, useState } from "react";
import { FilePreview } from "./FilePreview";
import { Card } from "./ui/card";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type Flows = "optimize-flow" | "describe-image-flow" | "remove-background-flow";
const flowDescriptions: Record<Flows, { title: string; description: string }> =
  {
    "optimize-flow": {
      title: "Image Optimization",
      description:
        'Upload an image file through a processing flow. This example uses the "optimize-flow" which optimizes and converts images to WEBP format at 80% quality',
    },
    "describe-image-flow": {
      title: "Image Description",
      description:
        'Upload an image file through a processing flow. This example uses the "describe-image-flow" which describes the image in detail',
    },
    "remove-background-flow": {
      title: "Remove Background",
      description:
        'Upload an image file through a processing flow. This example uses the "remove-background-flow" which removes the background from the image',
    },
  };

function FlowUploadContent() {
  const [flowId, setFlowId] = useState<Flows>("optimize-flow");

  const flowData = useMemo(() => flowDescriptions[flowId], [flowId]);

  const handleFlowIdChange = (value: string) => {
    setFlowId(value as Flows);
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
          <Label htmlFor="storage">Flow</Label>
          <Select value={flowId} onValueChange={handleFlowIdChange}>
            <SelectTrigger id="storage" className="w-64">
              <SelectValue placeholder="Select storage" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(flowDescriptions).map(([flowId, flowData]) => (
                <SelectItem key={flowId} value={flowId}>
                  {flowData.title}
                </SelectItem>
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
            Choose Image File
          </label>
          <input
            id="flow-file-input"
            type="file"
            accept="image/*"
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
                  Image uploaded and optimized successfully.
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
              Upload Another Image
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
