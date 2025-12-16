import { Upload, useUploadContext } from "@uploadista/react";
import { FilePreview } from "./FilePreview";
import { Card } from "./ui/card";

/**
 * Example demonstrating the Upload compound component pattern.
 * This shows how to build custom upload UIs using composable primitives
 * with complete control over rendering and behavior.
 */
export function UploadCompoundExample() {
  return (
    <Card className="p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">
          Upload Compound Component
        </h2>
        <p className="text-gray-600 leading-relaxed">
          Build custom upload interfaces using the composable Upload component.
          This pattern provides maximum flexibility with headless primitives
          that you can style and arrange however you want.
        </p>
      </div>

      <Upload
        multiple
        maxConcurrent={3}
        autoStart={false}
        onSuccess={(result) => {
          console.log("File uploaded:", result);
        }}
        onError={(error) => {
          console.error("Upload failed:", error);
        }}
        onComplete={(results) => {
          console.log("All uploads complete:", results);
          if (results.successful.length > 0) {
            alert(
              `${results.successful.length}/${results.total} files uploaded successfully`,
            );
          }
        }}
      >
        <div className="space-y-6">
          {/* Drop Zone */}
          <Upload.DropZone
            accept="image/*,video/*,.pdf"
            maxFiles={10}
            maxFileSize={50 * 1024 * 1024}
          >
            {({
              isDragging,
              getRootProps,
              getInputProps,
              openFilePicker,
              errors,
            }) => (
              <div className="space-y-4">
                {/* biome-ignore lint/a11y/useKeyWithClickEvents: Example code */}
                {/* biome-ignore lint/a11y/noStaticElementInteractions: Example code */}
                <div
                  {...getRootProps()}
                  onClick={openFilePicker}
                  className={`
                      relative border-3 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300
                      ${
                        isDragging
                          ? "border-indigo-500 bg-gradient-to-br from-indigo-50 to-purple-50 scale-102"
                          : "border-gray-300 bg-gradient-to-br from-gray-50 to-white hover:border-indigo-400 hover:bg-gradient-to-br hover:from-indigo-50 hover:to-purple-50"
                      }
                    `}
                >
                  <input {...getInputProps()} />

                  <div className="pointer-events-none">
                    {isDragging ? (
                      <>
                        <div className="text-7xl mb-4 animate-bounce">📁</div>
                        <div className="text-2xl font-bold text-indigo-600 mb-2">
                          Drop your files here...
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mb-6">
                          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white mb-4">
                            <svg
                              className="w-10 h-10"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                              />
                            </svg>
                          </div>
                        </div>
                        <div className="text-2xl font-bold text-gray-900 mb-2">
                          Drag & drop files here
                        </div>
                        <div className="text-gray-500 mb-4">
                          or click to browse
                        </div>
                        <div className="inline-flex items-center gap-2 text-sm text-gray-400">
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span>
                            Images, videos, PDFs • Max 50MB • Up to 10 files
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Validation Errors */}
                {errors.length > 0 && (
                  <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl p-6 border border-red-200">
                    <div className="flex items-start gap-3">
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
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-red-900 mb-2">
                          Validation Errors
                        </h3>
                        <ul className="space-y-1">
                          {errors.map((error) => (
                            <li key={error} className="text-red-700 text-sm">
                              • {error}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Upload.DropZone>

          {/* Progress Overview */}
          <Upload.Progress>
            {({ progress, bytesUploaded, totalBytes, isUploading }) => (
              <ProgressSection
                progress={progress}
                bytesUploaded={bytesUploaded}
                totalBytes={totalBytes}
                isUploading={isUploading}
              />
            )}
          </Upload.Progress>

          {/* Status Overview */}
          <Upload.Status>
            {({ total, successful, failed, uploading }) =>
              total > 0 && (
                <div className="flex items-center justify-center gap-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-gray-600">Active: {uploading}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-gray-600">
                      Successful: {successful}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-gray-600">Failed: {failed}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-gray-300" />
                    <span className="text-gray-600">Total: {total}</span>
                  </div>
                </div>
              )
            }
          </Upload.Status>

          {/* File List */}
          <Upload.Items>
            {({ items, isEmpty }) =>
              !isEmpty && (
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">
                    Upload Queue
                  </h3>
                  <div className="space-y-3">
                    {items.map((item) => (
                      <Upload.Item key={item.id} id={item.id}>
                        {({ file, state: itemState, abort, retry, remove }) => (
                          <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all">
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
                                  {file instanceof File ? file.name : "File"}
                                </span>
                              </div>
                              <span
                                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold flex-shrink-0 ml-3 ${
                                  itemState.status === "uploading"
                                    ? "bg-blue-100 text-blue-700"
                                    : itemState.status === "success"
                                      ? "bg-green-100 text-green-700"
                                      : itemState.status === "error"
                                        ? "bg-red-100 text-red-700"
                                        : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {itemState.status}
                              </span>
                            </div>

                            {/* Progress Bar */}
                            <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden mb-3">
                              <div
                                className={`absolute inset-y-0 left-0 transition-all duration-300 ease-out rounded-full ${
                                  itemState.status === "success"
                                    ? "bg-green-500"
                                    : itemState.status === "error"
                                      ? "bg-red-500"
                                      : "progress-bar-gradient"
                                }`}
                                style={{
                                  width: `${itemState.progress}%`,
                                }}
                              />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2">
                              {itemState.status === "uploading" && (
                                <button
                                  type="button"
                                  onClick={abort}
                                  className="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
                                >
                                  Abort
                                </button>
                              )}
                              {itemState.status === "error" && (
                                <button
                                  type="button"
                                  onClick={retry}
                                  className="flex-1 px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-lg hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-100 transition-all"
                                >
                                  Retry
                                </button>
                              )}
                              {(itemState.status === "idle" ||
                                itemState.status === "error" ||
                                itemState.status === "success") && (
                                <button
                                  type="button"
                                  onClick={remove}
                                  className="flex-1 px-4 py-2 bg-gray-600 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-100 transition-all"
                                >
                                  Remove
                                </button>
                              )}
                            </div>

                            {/* File Preview for successful uploads */}
                            {itemState.status === "success" &&
                              itemState.result && (
                                <div className="mt-3">
                                  <FilePreview
                                    file={
                                      file instanceof File ? file : undefined
                                    }
                                    result={itemState.result}
                                  />
                                </div>
                              )}

                            {/* Error Message */}
                            {itemState.error && (
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
                                <span>Error: {itemState.error.message}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </Upload.Item>
                    ))}
                  </div>
                </div>
              )
            }
          </Upload.Items>

          {/* Error Display */}
          <Upload.Error>
            {({ hasError, failedCount, failedItems }) =>
              hasError && (
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
                        {failedCount} Upload(s) Failed
                      </h3>
                      <ul className="text-red-700 text-sm space-y-1">
                        {failedItems.map((item) => (
                          <li key={item.id}>
                            •{" "}
                            {item.file instanceof File
                              ? item.file.name
                              : "File"}
                            : {item.state.error?.message || "Unknown error"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )
            }
          </Upload.Error>
        </div>
      </Upload>
    </Card>
  );
}

/**
 * Progress section with action buttons.
 * This is extracted as a separate component to use the useUploadContext hook.
 */
function ProgressSection({
  progress,
  bytesUploaded,
  totalBytes,
  isUploading,
}: {
  progress: number;
  bytesUploaded: number;
  totalBytes: number;
  isUploading: boolean;
}) {
  const upload = useUploadContext();

  // Only show if there are items or uploading
  if (upload.items.length === 0 && !isUploading) {
    return null;
  }

  const pendingCount = upload.items.filter(
    (item) => item.state.status === "idle",
  ).length;
  const failedCount = upload.items.filter((item) =>
    ["error", "aborted"].includes(item.state.status),
  ).length;

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-100">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm font-semibold text-gray-500 mb-2">
            Overall Progress
          </div>
          <div className="text-2xl font-bold text-gray-900">{progress}%</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm font-semibold text-gray-500 mb-2">
            Bytes Uploaded
          </div>
          <div className="text-2xl font-bold text-blue-600">
            {(bytesUploaded / 1024 / 1024).toFixed(2)} MB
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm font-semibold text-gray-500 mb-2">
            Total Size
          </div>
          <div className="text-2xl font-bold text-purple-600">
            {(totalBytes / 1024 / 1024).toFixed(2)} MB
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="text-sm font-semibold text-gray-500 mb-2">Status</div>
          <div className="text-2xl font-bold text-green-600">
            {isUploading ? "Uploading" : "Ready"}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
        <div
          className="absolute inset-y-0 left-0 progress-bar-gradient transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-4 gap-3">
        <button
          type="button"
          onClick={upload.startAll}
          disabled={pendingCount === 0 || isUploading}
          className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-700 hover:to-emerald-700 focus:outline-none focus:ring-4 focus:ring-green-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
        >
          Start ({pendingCount})
        </button>

        <Upload.Cancel className="px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md">
          Cancel All
        </Upload.Cancel>

        <button
          type="button"
          onClick={upload.retryFailed}
          disabled={failedCount === 0}
          className="px-6 py-3 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
        >
          Retry Failed
        </button>

        <Upload.Reset className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-md">
          Clear All
        </Upload.Reset>
      </div>
    </div>
  );
}
