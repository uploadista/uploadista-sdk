import { useUpload } from "@uploadista/react";
import { FilePreview } from "./FilePreview";
import { Card } from "./ui/card";

export function BasicUploadExample() {
  const upload = useUpload({
    onSuccess: (result) => {
      console.log("Upload successful:", result);
    },
    onError: (error) => {
      console.error("Upload failed:", error);
    },
    onProgress: (uploadId, bytesUploaded, totalBytes) => {
      console.log(
        "Chunk complete:",
        uploadId,
        `${bytesUploaded}/${totalBytes} bytes`,
      );
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      upload.upload(file);
    }
  };

  return (
    <Card className="p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">
          Basic File Upload
        </h2>
        <p className="text-gray-600 leading-relaxed">
          Upload a single file using the Uploadista client. This example
          demonstrates basic upload functionality with progress tracking and
          error handling.
        </p>
      </div>

      <div className="space-y-6">
        {/* File Input */}
        <div>
          <label
            htmlFor="basic-file-input"
            className="block text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide"
          >
            Choose File
          </label>
          <input
            id="basic-file-input"
            type="file"
            onChange={handleFileSelect}
            disabled={upload.isUploading}
            className="block w-full text-gray-700 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:bg-gradient-to-r file:from-indigo-600 file:to-purple-600 file:text-white file:font-semibold file:cursor-pointer hover:file:from-indigo-700 hover:file:to-purple-700 file:transition-all file:shadow-md disabled:opacity-50 disabled:cursor-not-allowed border-2 border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Progress Section */}
        {upload.isUploading && (
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-100">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="text-sm font-semibold text-gray-500 mb-2">
                  Status
                </div>
                <div>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
                      upload.state.status === "uploading"
                        ? "bg-blue-100 text-blue-700"
                        : upload.state.status === "success"
                          ? "bg-green-100 text-green-700"
                          : upload.state.status === "error"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {upload.state.status}
                  </span>
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="text-sm font-semibold text-gray-500 mb-2">
                  Progress
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {upload.state.progress}%
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
              <div
                className="absolute inset-y-0 left-0 progress-bar-gradient transition-all duration-300 ease-out"
                style={{ width: `${upload.state.progress}%` }}
              />
            </div>

            {/* Abort Button */}
            <button
              type="button"
              onClick={upload.abort}
              disabled={!upload.isUploading}
              className="w-full px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              Abort Upload
            </button>
          </div>
        )}

        {/* Success Message */}
        {upload.state.status === "success" && (
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
                  Upload Complete!
                </h3>
                <p className="text-green-700">File uploaded successfully.</p>
              </div>
            </div>
            {/* File Preview */}
            {upload.state.result && (
              <FilePreview result={upload.state.result} className="mb-4" />
            )}

            {upload.state.result && (
              <details className="bg-white rounded-xl border border-green-200">
                <summary className="px-4 py-3 cursor-pointer font-semibold text-gray-700 hover:text-gray-900">
                  View Upload Details
                </summary>
                <pre className="px-4 pb-4 text-sm text-gray-800 overflow-auto font-mono">
                  {JSON.stringify(upload.state.result, null, 2)}
                </pre>
              </details>
            )}
            <button
              type="button"
              onClick={upload.reset}
              className="mt-4 w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-md"
            >
              Upload Another File
            </button>
          </div>
        )}

        {/* Error Message */}
        {upload.state.status === "error" && upload.state.error && (
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
                  Upload Failed
                </h3>
                <p className="text-red-700">{upload.state.error.message}</p>
              </div>
            </div>
            <div className="flex gap-3">
              {upload.canRetry && (
                <button
                  type="button"
                  onClick={upload.retry}
                  className="flex-1 px-6 py-3 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100 transition-all shadow-md"
                >
                  Retry Upload
                </button>
              )}
              <button
                type="button"
                onClick={upload.reset}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-md"
              >
                Try Another File
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
