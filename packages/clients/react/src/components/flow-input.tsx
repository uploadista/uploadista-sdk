"use client";

import { useDragDrop } from "../hooks/use-drag-drop";
import type { FlowInputMetadata } from "../hooks/use-flow";

export interface FlowInputProps {
  /** Input metadata from flow discovery */
  input: FlowInputMetadata;
  /** Accepted file types (e.g., "image/*", "video/*") */
  accept?: string;
  /** Whether the input should support URL input */
  allowUrl?: boolean;
  /** Current value (File or URL string) */
  value?: File | string | null;
  /** Callback when value changes */
  onChange: (value: File | string) => void;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Input component for flow execution with file drag-and-drop and URL support.
 *
 * Features:
 * - File drag-and-drop with visual feedback
 * - URL input for remote files
 * - Displays node name and description
 * - Shows selected file/URL with size
 * - Type validation and error display
 *
 * @example
 * ```tsx
 * <FlowInput
 *   input={inputMetadata}
 *   accept="image/*"
 *   allowUrl={true}
 *   value={selectedValue}
 *   onChange={(value) => flow.setInput(inputMetadata.nodeId, value)}
 * />
 * ```
 */
export function FlowInput({
  input,
  accept = "*",
  allowUrl = true,
  value,
  onChange,
  disabled = false,
  className = "",
}: FlowInputProps) {
  const isFileValue = value instanceof File;
  const isUrlValue = typeof value === "string" && value.length > 0;

  // Determine input mode based on node type
  const supportsFileUpload = input.nodeType === "streaming-input-v1";
  const supportsUrl =
    allowUrl &&
    (input.nodeType === "url-input-v1" ||
      input.nodeType === "streaming-input-v1");

  const dragDrop = useDragDrop({
    onFilesReceived: (files) => {
      if (files[0]) {
        onChange(files[0]);
      }
    },
    accept: accept ? accept.split(",").map((type) => type.trim()) : undefined,
    multiple: false,
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onChange(file);
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleClear = () => {
    onChange("");
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-semibold text-gray-900">{input.nodeName}</h4>
          {input.required && <span className="text-red-500 text-sm">*</span>}
          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
            {input.nodeType}
          </span>
        </div>
        {input.nodeDescription && (
          <p className="text-sm text-gray-600">{input.nodeDescription}</p>
        )}
      </div>

      {/* File Upload Area */}
      {supportsFileUpload && (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          {...dragDrop.dragHandlers}
          onClick={() => !disabled && dragDrop.openFilePicker()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !disabled) {
              e.preventDefault();
              dragDrop.openFilePicker();
            }
          }}
          className={`
            relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
            ${
              dragDrop.state.isDragging
                ? "border-indigo-500 bg-indigo-50"
                : "border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/50"
            }
            ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          {dragDrop.state.isDragging ? (
            <div className="flex flex-col items-center gap-2">
              <svg
                className="w-8 h-8 text-indigo-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <title>Drop file</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-sm font-medium text-indigo-600">
                Drop file here
              </p>
            </div>
          ) : isFileValue ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg
                  className="w-5 h-5 text-green-500"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">
                    {value.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {(value.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleClear();
                }}
                className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <title>Upload file</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-700">
                  Drag and drop a file here, or click to select
                </p>
                <p className="text-xs text-gray-500 mt-1">Accepted: {accept}</p>
              </div>
            </div>
          )}
          <input {...dragDrop.inputProps} />
        </div>
      )}

      {/* Drag & Drop Errors */}
      {dragDrop.state.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          {dragDrop.state.errors.map((error, index) => (
            <p key={index} className="text-sm text-red-700">
              {error}
            </p>
          ))}
        </div>
      )}

      {/* URL Input */}
      {supportsUrl && supportsFileUpload && (
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-gray-300" />
          <span className="text-xs font-medium text-gray-500 uppercase">
            Or
          </span>
          <div className="flex-1 border-t border-gray-300" />
        </div>
      )}

      {supportsUrl && (
        <div className="space-y-2">
          {!supportsFileUpload && (
            <label
              htmlFor={`url-${input.nodeId}`}
              className="block text-sm font-medium text-gray-700"
            >
              URL
            </label>
          )}
          <div className="relative">
            <input
              id={`url-${input.nodeId}`}
              type="url"
              value={isUrlValue ? value : ""}
              onChange={handleUrlChange}
              disabled={disabled}
              placeholder="https://example.com/file.jpg"
              className="block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            />
            {isUrlValue && (
              <button
                type="button"
                onClick={handleClear}
                disabled={disabled}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Clear URL"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <title>Clear</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
          {isUrlValue && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <svg
                className="w-4 h-4 text-blue-500"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="truncate">{value}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
