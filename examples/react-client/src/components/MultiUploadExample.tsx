import { useMultiUpload } from "@uploadista/react";
import { FilePreview } from "./FilePreview";
import { Card } from "./ui/card";

export function MultiUploadExample() {
  const multiUpload = useMultiUpload({
    maxConcurrent: 3,
    onUploadStart: (item) => {
      console.log("Upload started:", item);
    },
    onUploadProgress: (item, progress, bytesUploaded, totalBytes) => {
      console.log(
        "Upload progress:",
        item,
        progress,
        bytesUploaded,
        totalBytes,
      );
    },
    onUploadSuccess: (item, result) => {
      console.log("Upload success:", item, result);
    },
    onUploadError: (item, error) => {
      console.log("Upload error:", item, error);
    },
    onComplete: (results) => {
      console.log("All uploads complete:", results);
      alert(
        `${results.successful.length}/${results.total} files uploaded successfully`,
      );
    },
  });

  const handleFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      multiUpload.addFiles(Array.from(e.target.files));
      multiUpload.startAll();
    }
  };

  return (
    <Card className="p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">
          Multiple File Upload
        </h2>
        <p className="text-gray-600 leading-relaxed">
          Upload multiple files concurrently. This example demonstrates batch
          uploading with configurable concurrency limits and individual file
          progress tracking.
        </p>
      </div>

      <div className="space-y-6">
        {/* File Input */}
        <div>
          <label
            htmlFor="multi-file-input"
            className="block text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide"
          >
            Choose Multiple Files
          </label>
          <input
            id="multi-file-input"
            type="file"
            multiple
            onChange={handleFilesSelect}
            disabled={multiUpload.state.uploading > 0}
            className="block w-full text-gray-700 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:bg-gradient-to-r file:from-indigo-600 file:to-purple-600 file:text-white file:font-semibold file:cursor-pointer hover:file:from-indigo-700 hover:file:to-purple-700 file:transition-all file:shadow-md disabled:opacity-50 disabled:cursor-not-allowed border-2 border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500"
          />
        </div>

        {multiUpload.items.length > 0 && (
          <>
            {/* Overview Section */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-100">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="text-sm font-semibold text-gray-500 mb-2">
                    Overall Progress
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {multiUpload.state.progress}%
                  </div>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="text-sm font-semibold text-gray-500 mb-2">
                    Active Uploads
                  </div>
                  <div className="text-2xl font-bold text-blue-600">
                    {multiUpload.state.uploading}
                  </div>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="text-sm font-semibold text-gray-500 mb-2">
                    Successful
                  </div>
                  <div className="text-2xl font-bold text-green-600">
                    {multiUpload.state.successful}
                  </div>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="text-sm font-semibold text-gray-500 mb-2">
                    Failed
                  </div>
                  <div className="text-2xl font-bold text-red-600">
                    {multiUpload.state.failed}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
                <div
                  className="absolute inset-y-0 left-0 progress-bar-gradient transition-all duration-300 ease-out"
                  style={{ width: `${multiUpload.state.progress}%` }}
                />
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={multiUpload.abortAll}
                  disabled={multiUpload.state.uploading === 0}
                  className="px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                >
                  Abort All
                </button>
                <button
                  type="button"
                  onClick={multiUpload.retryFailed}
                  disabled={multiUpload.state.failed === 0}
                  className="px-6 py-3 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                >
                  Retry Failed
                </button>
                <button
                  type="button"
                  onClick={multiUpload.clearAll}
                  className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-md"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* File List */}
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                File List
              </h3>
              <div className="space-y-3">
                {multiUpload.items.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex-shrink-0">
                          <svg
                            className="w-8 h-8 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                        <span className="font-semibold text-gray-900 truncate">
                          {item.file instanceof File ? item.file.name : "File"}
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold flex-shrink-0 ml-3 ${
                          item.state.status === "uploading"
                            ? "bg-blue-100 text-blue-700"
                            : item.state.status === "success"
                              ? "bg-green-100 text-green-700"
                              : item.state.status === "error"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {item.state.status}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden mb-3">
                      <div
                        className={`absolute inset-y-0 left-0 transition-all duration-300 ease-out rounded-full ${
                          item.state.status === "success"
                            ? "bg-green-500"
                            : item.state.status === "error"
                              ? "bg-red-500"
                              : "progress-bar-gradient"
                        }`}
                        style={{ width: `${item.state.progress}%` }}
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      {item.state.status === "uploading" && (
                        <button
                          type="button"
                          onClick={() => multiUpload.abortUpload(item.id)}
                          className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
                        >
                          Abort
                        </button>
                      )}
                      {item.state.status === "error" && (
                        <button
                          type="button"
                          onClick={() => multiUpload.retryUpload(item.id)}
                          className="flex-1 px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-lg hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-100 transition-all"
                        >
                          Retry
                        </button>
                      )}
                      {(item.state.status === "idle" ||
                        item.state.status === "error") && (
                        <button
                          type="button"
                          onClick={() => multiUpload.removeFile(item.id)}
                          className="flex-1 px-4 py-2 bg-gray-600 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-100 transition-all"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {/* File Preview for successful uploads */}
                    {item.state.status === "success" && (
                      <div className="mt-3">
                        <FilePreview
                          file={
                            item.file instanceof File ? item.file : undefined
                          }
                          result={item.state.result}
                        />
                      </div>
                    )}

                    {/* Error Message */}
                    {item.state.error && (
                      <div className="mt-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-lg p-2">
                        <svg
                          className="w-4 h-4 flex-shrink-0 mt-0.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span>Error: {item.state.error.message}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
