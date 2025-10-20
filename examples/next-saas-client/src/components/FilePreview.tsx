interface FilePreviewProps {
  file?: File;
  result?: any;
  className?: string;
}

export function FilePreview({
  file,
  result,
  className = "",
}: FilePreviewProps) {
  // Extract MIME type from various sources
  const mimeType = file?.type || result?.mimeType || result?.type || "";
  const fileName = file?.name || result?.name || result?.fileName || "File";

  // Determine if this is an image or video
  const isImage = mimeType.startsWith("image/");
  const isVideo = mimeType.startsWith("video/");

  // Try to get a URL to display the file
  let fileUrl: string | null = null;

  if (file) {
    // Create object URL from File
    fileUrl = URL.createObjectURL(file);
  } else if (result?.url) {
    // Use URL from result
    fileUrl = result.url;
  } else if (result?.path) {
    // Construct URL from path (assuming it's accessible)
    fileUrl = result.path;
  }

  if (!fileUrl || (!isImage && !isVideo)) {
    return null;
  }

  return (
    <div
      className={`rounded-xl overflow-hidden border border-gray-200 bg-gray-50 ${className}`}
    >
      {isImage && (
        <img
          src={fileUrl}
          alt={fileName}
          className="w-full h-auto object-contain max-h-96"
          onError={(e) => {
            // Hide image if it fails to load
            e.currentTarget.style.display = "none";
          }}
        />
      )}
      {isVideo && (
        // biome-ignore lint/a11y/useMediaCaption: not needed
        <video
          src={fileUrl}
          controls
          className="w-full h-auto object-contain max-h-96"
          onError={(e) => {
            // Hide video if it fails to load
            e.currentTarget.style.display = "none";
          }}
        >
          Your browser does not support the video tag.
        </video>
      )}
      <div className="px-4 py-2 bg-white border-t border-gray-200">
        <div className="flex items-center gap-2 text-sm">
          <svg
            className="w-4 h-4 text-gray-400 flex-shrink-0"
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
          <span className="font-medium text-gray-700 truncate">{fileName}</span>
          {mimeType && (
            <span className="ml-auto text-gray-500 text-xs font-mono">
              {mimeType}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
