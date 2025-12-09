import { UploadistaProvider } from "@uploadista/react";
import { useState } from "react";
import { BasicUploadExample } from "./components/BasicUploadExample";
import { DragDropUploadExample } from "./components/DragDropUploadExample";
import { FlowExample } from "./components/FlowExample";
import { MultiUploadExample } from "./components/MultiUploadExample";
import "./App.css";
import { Card } from "./components/ui/card";

function App() {
  const [serverUrl, setServerUrl] = useState(
    import.meta.env.VITE_API_URL || "http://localhost:3000",
  );
  const [activeTab, setActiveTab] = useState<
    "basic" | "flow" | "useflow" | "multi" | "dragdrop"
  >("basic");

  return (
    <UploadistaProvider
      baseUrl={serverUrl}
      uploadistaBasePath="uploadista"
      storageId="local"
      chunkSize={1024 * 1024} // 1MB chunks
      storeFingerprintForResuming={true}
    >
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        {/* Header */}
        <header className="relative overflow-hidden bg-white border-b border-gray-200">
          <div className="absolute inset-0 bg-gradient-to-r from-primary to-tertiary opacity-5" />
          <div className="relative mx-auto flex max-w-7xl flex-col items-center px-6 py-12 text-center">
            <h1 className="mb-4 bg-gradient-to-r from-primary to-tertiary bg-clip-text text-5xl font-bold text-transparent mx-auto">
              Uploadista React Client
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Interactive examples for testing Uploadista server implementations
            </p>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-6 py-12">
          {/* Server Configuration */}
          <Card className="mb-8 p-6">
            <label htmlFor="server-url" className="block mb-3">
              <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Server URL
              </span>
              <input
                id="server-url"
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://localhost:3000"
                className="mt-2 w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all outline-none text-gray-800 font-medium"
              />
            </label>
            <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
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
                Express server:{" "}
                <code className="px-2 py-1 bg-gray-100 rounded-md font-mono text-xs">
                  http://localhost:3000
                </code>
                {" | "}
                Hono server:{" "}
                <code className="px-2 py-1 bg-gray-100 rounded-md font-mono text-xs">
                  http://localhost:3000
                </code>
              </span>
            </div>
          </Card>

          {/* Tabs */}
          <div className="flex gap-2 mb-8 overflow-x-auto pb-2 px-2">
            <button
              type="button"
              onClick={() => setActiveTab("basic")}
              className={`
              flex-1 min-w-[140px] px-6 py-4 rounded-xl font-semibold transition-all duration-300
              ${
                activeTab === "basic"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/50 scale-105"
                  : "bg-white text-gray-600 hover:text-indigo-600 hover:shadow-md border border-gray-200"
              }
            `}
            >
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="w-5 h-5"
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
                Basic Upload
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("flow")}
              className={`
              flex-1 min-w-[140px] px-6 py-4 rounded-xl font-semibold transition-all duration-300
              ${
                activeTab === "flow"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/50 scale-105"
                  : "bg-white text-gray-600 hover:text-indigo-600 hover:shadow-md border border-gray-200"
              }
            `}
            >
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                Flow Upload
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("multi")}
              className={`
              flex-1 min-w-[140px] px-6 py-4 rounded-xl font-semibold transition-all duration-300
              ${
                activeTab === "multi"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/50 scale-105"
                  : "bg-white text-gray-600 hover:text-indigo-600 hover:shadow-md border border-gray-200"
              }
            `}
            >
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Multi Upload
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("dragdrop")}
              className={`
              flex-1 min-w-[140px] px-6 py-4 rounded-xl font-semibold transition-all duration-300
              ${
                activeTab === "dragdrop"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/50 scale-105"
                  : "bg-white text-gray-600 hover:text-indigo-600 hover:shadow-md border border-gray-200"
              }
            `}
            >
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                  />
                </svg>
                Drag & Drop
              </span>
            </button>
          </div>

          {/* Content */}
          <div className="min-h-[500px]">
            {activeTab === "basic" && <BasicUploadExample />}
            {activeTab === "flow" && <FlowExample />}
            {activeTab === "multi" && <MultiUploadExample />}
            {activeTab === "dragdrop" && <DragDropUploadExample />}
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-gray-200 mt-16">
          <div className="max-w-7xl mx-auto px-6 py-8 text-center">
            <p className="text-gray-600 flex items-center justify-center gap-2">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Start your server with{" "}
              <code className="px-2 py-1 bg-gray-100 rounded-md font-mono text-sm mx-1">
                pnpm dev
              </code>{" "}
              in the{" "}
              <code className="px-2 py-1 bg-gray-100 rounded-md font-mono text-sm">
                examples/express-server
              </code>{" "}
              or{" "}
              <code className="px-2 py-1 bg-gray-100 rounded-md font-mono text-sm">
                examples/hono-server
              </code>{" "}
              directory
            </p>
          </div>
        </footer>
      </div>
    </UploadistaProvider>
  );
}

export default App;
