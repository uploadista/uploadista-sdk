"use client";

import type { FlowUploadOptions } from "@uploadista/client-browser";
import type {
  FlowUploadState,
  FlowUploadStatus,
  InputExecutionState,
} from "@uploadista/client-core";
import type { TypedOutput } from "@uploadista/core/flow";
import { createContext, type ReactNode, useCallback, useContext } from "react";
import {
  type DragDropState,
  type UseDragDropReturn,
  useDragDrop,
} from "../hooks/use-drag-drop";
import { type FlowInputMetadata, useFlow } from "../hooks/use-flow";

// Re-export types for convenience
export type {
  FlowUploadState,
  FlowUploadStatus,
  InputExecutionState,
  FlowInputMetadata,
};

// ============ FLOW CONTEXT ============

/**
 * Context value provided by the Flow component root.
 * Contains all flow state and actions.
 */
export interface FlowContextValue {
  /** Current upload state */
  state: FlowUploadState;
  /** Discovered input nodes metadata (null until discovery completes) */
  inputMetadata: FlowInputMetadata[] | null;
  /** Current input values set via setInput() */
  inputs: Record<string, unknown>;
  /** Per-input execution state for multi-input flows */
  inputStates: ReadonlyMap<string, InputExecutionState>;

  /** Set an input value for a specific node */
  setInput: (nodeId: string, value: unknown) => void;
  /** Execute the flow with current inputs */
  execute: () => Promise<void>;
  /** Upload a single file through the flow */
  upload: (file: File | Blob) => Promise<void>;
  /** Abort the current upload */
  abort: () => void;
  /** Pause the current upload */
  pause: () => void;
  /** Resume a paused upload */
  resume: () => void;
  /** Reset the upload state and clear all inputs */
  reset: () => void;

  /** Whether an upload or flow execution is in progress */
  isUploading: boolean;
  /** Whether the file is currently being uploaded */
  isUploadingFile: boolean;
  /** Whether the flow is currently processing */
  isProcessing: boolean;
  /** Whether the hook is discovering flow inputs */
  isDiscoveringInputs: boolean;
  /** Whether the flow is currently paused */
  isPaused: boolean;
}

const FlowContext = createContext<FlowContextValue | null>(null);

/**
 * Hook to access flow context from within a Flow component.
 * @throws Error if used outside of a Flow component
 */
export function useFlowContext(): FlowContextValue {
  const context = useContext(FlowContext);
  if (!context) {
    throw new Error(
      "useFlowContext must be used within a <Flow> component. " +
        'Wrap your component tree with <Flow flowId="..." storageId="...">',
    );
  }
  return context;
}

// ============ FLOW INPUT CONTEXT ============

/**
 * Context value for a specific input node within a Flow.
 */
export interface FlowInputContextValue {
  /** Input node ID */
  nodeId: string;
  /** Input metadata from flow discovery */
  metadata: FlowInputMetadata;
  /** Current value for this input */
  value: unknown;
  /** Set the value for this input */
  setValue: (value: unknown) => void;
  /** Per-input execution state (if available) */
  state: InputExecutionState | undefined;
}

const FlowInputContext = createContext<FlowInputContextValue | null>(null);

/**
 * Hook to access flow input context from within a Flow.Input component.
 * @throws Error if used outside of a Flow.Input component
 */
export function useFlowInputContext(): FlowInputContextValue {
  const context = useContext(FlowInputContext);
  if (!context) {
    throw new Error(
      "useFlowInputContext must be used within a <Flow.Input> component. " +
        'Wrap your component with <Flow.Input nodeId="...">',
    );
  }
  return context;
}

// ============ FLOW ROOT COMPONENT ============

/**
 * Props for the Flow root component.
 */
export interface FlowProps {
  /** Flow ID to execute */
  flowId: string;
  /** Storage ID for file uploads */
  storageId: string;
  /** Optional output node ID to wait for */
  outputNodeId?: string;
  /** Optional metadata to include with the flow execution */
  metadata?: Record<string, string>;
  /** Called when flow completes successfully */
  onSuccess?: (outputs: TypedOutput[]) => void;
  /** Called when flow fails */
  onError?: (error: Error) => void;
  /** Called on upload progress */
  onProgress?: (
    uploadId: string,
    bytesUploaded: number,
    totalBytes: number | null,
  ) => void;
  /** Called when flow completes with all outputs */
  onFlowComplete?: (outputs: TypedOutput[]) => void;
  /** Called when upload is aborted */
  onAbort?: () => void;
  /** Children to render */
  children: ReactNode;
}

/**
 * Root component for flow-based uploads.
 * Provides context for all Flow sub-components.
 *
 * @example
 * ```tsx
 * <Flow flowId="image-optimizer" storageId="s3" onSuccess={handleSuccess}>
 *   <Flow.DropZone accept="image/*">
 *     {({ isDragging, getRootProps, getInputProps }) => (
 *       <div {...getRootProps()}>
 *         <input {...getInputProps()} />
 *         {isDragging ? "Drop here" : "Drag or click"}
 *       </div>
 *     )}
 *   </Flow.DropZone>
 * </Flow>
 * ```
 */
function FlowRoot({
  flowId,
  storageId,
  outputNodeId,
  metadata,
  onSuccess,
  onError,
  onProgress,
  onFlowComplete,
  onAbort,
  children,
}: FlowProps) {
  const options: FlowUploadOptions = {
    flowConfig: {
      flowId,
      storageId,
      outputNodeId,
      metadata,
    },
    onSuccess,
    onError,
    onProgress,
    onFlowComplete,
    onAbort,
  };

  const flow = useFlow(options);

  const contextValue: FlowContextValue = {
    state: flow.state,
    inputMetadata: flow.inputMetadata,
    inputs: flow.inputs,
    inputStates: flow.inputStates,
    setInput: flow.setInput,
    execute: flow.execute,
    upload: flow.upload,
    abort: flow.abort,
    pause: flow.pause,
    resume: flow.resume,
    reset: flow.reset,
    isUploading: flow.isUploading,
    isUploadingFile: flow.isUploadingFile,
    isProcessing: flow.isProcessing,
    isDiscoveringInputs: flow.isDiscoveringInputs,
    isPaused: flow.isPaused,
  };

  return (
    <FlowContext.Provider value={contextValue}>{children}</FlowContext.Provider>
  );
}

// ============ DROP ZONE PRIMITIVE ============

/**
 * Render props for Flow.DropZone component.
 */
export interface FlowDropZoneRenderProps {
  /** Whether files are being dragged over */
  isDragging: boolean;
  /** Whether drag is over the zone */
  isOver: boolean;
  /** Upload progress (0-100) */
  progress: number;
  /** Current flow status */
  status: FlowUploadStatus;
  /** Props to spread on the drop zone container */
  getRootProps: () => UseDragDropReturn["dragHandlers"];
  /** Props to spread on the hidden file input */
  getInputProps: () => UseDragDropReturn["inputProps"];
  /** Open file picker programmatically */
  openFilePicker: () => void;
  /** Current drag-drop state */
  dragDropState: DragDropState;
}

/**
 * Props for Flow.DropZone component.
 */
export interface FlowDropZoneProps {
  /** Accepted file types (e.g., "image/*", ".pdf") */
  accept?: string;
  /** Maximum file size in bytes */
  maxFileSize?: number;
  /** Render function receiving drop zone state */
  children: (props: FlowDropZoneRenderProps) => ReactNode;
}

/**
 * Drop zone for single-file uploads within a Flow.
 * Automatically calls flow.upload() when a file is dropped.
 *
 * @example
 * ```tsx
 * <Flow.DropZone accept="image/*">
 *   {({ isDragging, progress, getRootProps, getInputProps }) => (
 *     <div {...getRootProps()}>
 *       <input {...getInputProps()} />
 *       {isDragging ? "Drop here" : `Progress: ${progress}%`}
 *     </div>
 *   )}
 * </Flow.DropZone>
 * ```
 */
function FlowDropZone({ accept, maxFileSize, children }: FlowDropZoneProps) {
  const flow = useFlowContext();

  const dragDrop = useDragDrop({
    onFilesReceived: (files) => {
      const file = files[0];
      if (file) {
        flow.upload(file);
      }
    },
    accept: accept ? accept.split(",").map((t) => t.trim()) : undefined,
    maxFileSize,
    multiple: false,
  });

  const renderProps: FlowDropZoneRenderProps = {
    isDragging: dragDrop.state.isDragging,
    isOver: dragDrop.state.isOver,
    progress: flow.state.progress,
    status: flow.state.status,
    getRootProps: () => dragDrop.dragHandlers,
    getInputProps: () => dragDrop.inputProps,
    openFilePicker: dragDrop.openFilePicker,
    dragDropState: dragDrop.state,
  };

  return <>{children(renderProps)}</>;
}

// ============ INPUTS DISCOVERY PRIMITIVE ============

/**
 * Render props for Flow.Inputs component.
 */
export interface FlowInputsRenderProps {
  /** Discovered input metadata */
  inputs: FlowInputMetadata[];
  /** Whether inputs are still being discovered */
  isLoading: boolean;
}

/**
 * Props for Flow.Inputs component.
 */
export interface FlowInputsProps {
  /** Render function receiving discovered inputs */
  children: (props: FlowInputsRenderProps) => ReactNode;
}

/**
 * Auto-discovers flow input nodes and provides them via render props.
 *
 * @example
 * ```tsx
 * <Flow.Inputs>
 *   {({ inputs, isLoading }) => (
 *     isLoading ? <Spinner /> : (
 *       inputs.map(input => (
 *         <Flow.Input key={input.nodeId} nodeId={input.nodeId}>
 *           ...
 *         </Flow.Input>
 *       ))
 *     )
 *   )}
 * </Flow.Inputs>
 * ```
 */
function FlowInputs({ children }: FlowInputsProps) {
  const flow = useFlowContext();

  const renderProps: FlowInputsRenderProps = {
    inputs: flow.inputMetadata ?? [],
    isLoading: flow.isDiscoveringInputs,
  };

  return <>{children(renderProps)}</>;
}

// ============ INPUT PRIMITIVE ============

/**
 * Props for Flow.Input component.
 */
export interface FlowInputProps {
  /** Input node ID */
  nodeId: string;
  /** Children (can be render function or regular children) */
  children: ReactNode | ((props: FlowInputContextValue) => ReactNode);
}

/**
 * Scoped input context provider for a specific input node.
 * Children can access input-specific state via useFlowInputContext().
 *
 * @example
 * ```tsx
 * <Flow.Input nodeId="video-input">
 *   {({ metadata, value, setValue }) => (
 *     <div>
 *       <label>{metadata.nodeName}</label>
 *       <Flow.Input.DropZone>...</Flow.Input.DropZone>
 *     </div>
 *   )}
 * </Flow.Input>
 * ```
 */
function FlowInput({ nodeId, children }: FlowInputProps) {
  const flow = useFlowContext();

  const metadata = flow.inputMetadata?.find((m) => m.nodeId === nodeId);

  if (!metadata) {
    // Input not yet discovered or doesn't exist
    return null;
  }

  const contextValue: FlowInputContextValue = {
    nodeId,
    metadata,
    value: flow.inputs[nodeId],
    setValue: (value) => flow.setInput(nodeId, value),
    state: flow.inputStates.get(nodeId),
  };

  return (
    <FlowInputContext.Provider value={contextValue}>
      {typeof children === "function" ? children(contextValue) : children}
    </FlowInputContext.Provider>
  );
}

// ============ INPUT DROP ZONE PRIMITIVE ============

/**
 * Render props for Flow.Input.DropZone component.
 */
export interface FlowInputDropZoneRenderProps {
  /** Whether files are being dragged over */
  isDragging: boolean;
  /** Whether drag is over the zone */
  isOver: boolean;
  /** Current value for this input */
  value: unknown;
  /** Per-input progress (if available) */
  progress: number;
  /** Per-input status (if available) */
  status: string;
  /** Props to spread on the drop zone container */
  getRootProps: () => UseDragDropReturn["dragHandlers"];
  /** Props to spread on the hidden file input */
  getInputProps: () => UseDragDropReturn["inputProps"];
  /** Open file picker programmatically */
  openFilePicker: () => void;
  /** Current drag-drop state */
  dragDropState: DragDropState;
}

/**
 * Props for Flow.Input.DropZone component.
 */
export interface FlowInputDropZoneProps {
  /** Accepted file types (e.g., "image/*", ".pdf") */
  accept?: string;
  /** Maximum file size in bytes */
  maxFileSize?: number;
  /** Render function receiving drop zone state */
  children: (props: FlowInputDropZoneRenderProps) => ReactNode;
}

/**
 * Drop zone for a specific input within a Flow.Input.
 * Sets the input value but does NOT trigger upload until Flow.Submit is clicked.
 */
function FlowInputDropZone({
  accept,
  maxFileSize,
  children,
}: FlowInputDropZoneProps) {
  const input = useFlowInputContext();

  const dragDrop = useDragDrop({
    onFilesReceived: (files) => {
      const file = files[0];
      if (file) {
        input.setValue(file);
      }
    },
    accept: accept ? accept.split(",").map((t) => t.trim()) : undefined,
    maxFileSize,
    multiple: false,
  });

  const renderProps: FlowInputDropZoneRenderProps = {
    isDragging: dragDrop.state.isDragging,
    isOver: dragDrop.state.isOver,
    value: input.value,
    progress: input.state?.progress ?? 0,
    status: input.state?.status ?? "idle",
    getRootProps: () => dragDrop.dragHandlers,
    getInputProps: () => dragDrop.inputProps,
    openFilePicker: dragDrop.openFilePicker,
    dragDropState: dragDrop.state,
  };

  return <>{children(renderProps)}</>;
}

// ============ INPUT URL FIELD PRIMITIVE ============

/**
 * Props for Flow.Input.UrlField component.
 */
export interface FlowInputUrlFieldProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type"
  > {
  /** Placeholder text */
  placeholder?: string;
}

/**
 * URL input field for a specific input within a Flow.Input.
 * Automatically binds to the input context value.
 */
function FlowInputUrlField({
  placeholder = "https://example.com/file",
  ...props
}: FlowInputUrlFieldProps) {
  const input = useFlowInputContext();
  const isUrl = typeof input.value === "string";

  return (
    <input
      type="url"
      value={isUrl ? (input.value as string) : ""}
      onChange={(e) => input.setValue(e.target.value)}
      placeholder={placeholder}
      {...props}
    />
  );
}

// ============ INPUT PREVIEW PRIMITIVE ============

/**
 * Render props for Flow.Input.Preview component.
 */
export interface FlowInputPreviewRenderProps {
  /** Current value */
  value: unknown;
  /** Whether value is a File */
  isFile: boolean;
  /** Whether value is a URL string */
  isUrl: boolean;
  /** File name (if value is File) */
  fileName: string | null;
  /** File size in bytes (if value is File) */
  fileSize: number | null;
  /** Clear the input value */
  clear: () => void;
}

/**
 * Props for Flow.Input.Preview component.
 */
export interface FlowInputPreviewProps {
  /** Render function receiving preview state */
  children: (props: FlowInputPreviewRenderProps) => ReactNode;
}

/**
 * Preview component for showing the selected value within a Flow.Input.
 */
function FlowInputPreview({ children }: FlowInputPreviewProps) {
  const input = useFlowInputContext();

  const isFile = input.value instanceof File;
  const isUrl = typeof input.value === "string" && input.value.length > 0;

  const renderProps: FlowInputPreviewRenderProps = {
    value: input.value,
    isFile,
    isUrl,
    fileName: isFile ? (input.value as File).name : null,
    fileSize: isFile ? (input.value as File).size : null,
    clear: () => input.setValue(undefined),
  };

  return <>{children(renderProps)}</>;
}

// ============ PROGRESS PRIMITIVE ============

/**
 * Render props for Flow.Progress component.
 */
export interface FlowProgressRenderProps {
  /** Progress percentage (0-100) */
  progress: number;
  /** Bytes uploaded so far */
  bytesUploaded: number;
  /** Total bytes to upload (null if unknown) */
  totalBytes: number | null;
  /** Current status */
  status: FlowUploadStatus;
}

/**
 * Props for Flow.Progress component.
 */
export interface FlowProgressProps {
  /** Render function receiving progress state */
  children: (props: FlowProgressRenderProps) => ReactNode;
}

/**
 * Progress display component within a Flow.
 */
function FlowProgress({ children }: FlowProgressProps) {
  const flow = useFlowContext();

  const renderProps: FlowProgressRenderProps = {
    progress: flow.state.progress,
    bytesUploaded: flow.state.bytesUploaded,
    totalBytes: flow.state.totalBytes,
    status: flow.state.status,
  };

  return <>{children(renderProps)}</>;
}

// ============ STATUS PRIMITIVE ============

/**
 * Render props for Flow.Status component.
 */
export interface FlowStatusRenderProps {
  /** Current status */
  status: FlowUploadStatus;
  /** Current node being processed (if any) */
  currentNodeName: string | null;
  /** Current node type (if any) */
  currentNodeType: string | null;
  /** Error (if status is error) */
  error: Error | null;
  /** Job ID (if started) */
  jobId: string | null;
  /** Whether flow has started */
  flowStarted: boolean;
  /** Flow outputs (if completed) */
  flowOutputs: TypedOutput[] | null;
}

/**
 * Props for Flow.Status component.
 */
export interface FlowStatusProps {
  /** Render function receiving status state */
  children: (props: FlowStatusRenderProps) => ReactNode;
}

/**
 * Status display component within a Flow.
 */
function FlowStatus({ children }: FlowStatusProps) {
  const flow = useFlowContext();

  const renderProps: FlowStatusRenderProps = {
    status: flow.state.status,
    currentNodeName: flow.state.currentNodeName,
    currentNodeType: flow.state.currentNodeType,
    error: flow.state.error,
    jobId: flow.state.jobId,
    flowStarted: flow.state.flowStarted,
    flowOutputs: flow.state.flowOutputs,
  };

  return <>{children(renderProps)}</>;
}

// ============ ERROR PRIMITIVE ============

/**
 * Render props for Flow.Error component.
 */
export interface FlowErrorRenderProps {
  /** Error object (null if no error) */
  error: Error | null;
  /** Whether there is an error */
  hasError: boolean;
  /** Error message */
  message: string | null;
  /** Reset the flow */
  reset: () => void;
}

/**
 * Props for Flow.Error component.
 */
export interface FlowErrorProps {
  /** Render function receiving error state */
  children: (props: FlowErrorRenderProps) => ReactNode;
}

/**
 * Error display component within a Flow.
 */
function FlowError({ children }: FlowErrorProps) {
  const flow = useFlowContext();

  const renderProps: FlowErrorRenderProps = {
    error: flow.state.error,
    hasError: flow.state.status === "error",
    message: flow.state.error?.message ?? null,
    reset: flow.reset,
  };

  return <>{children(renderProps)}</>;
}

// ============ ACTION PRIMITIVES ============

/**
 * Props for Flow.Submit component.
 */
export interface FlowSubmitProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Button content */
  children: ReactNode;
}

/**
 * Submit button that executes the flow with current inputs.
 * Automatically disabled when uploading.
 */
function FlowSubmit({ children, disabled, ...props }: FlowSubmitProps) {
  const flow = useFlowContext();

  const handleClick = useCallback(() => {
    flow.execute();
  }, [flow]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || flow.isUploading}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Props for Flow.Cancel component.
 */
export interface FlowCancelProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Button content */
  children: ReactNode;
}

/**
 * Cancel button that aborts the current upload.
 */
function FlowCancel({ children, ...props }: FlowCancelProps) {
  const flow = useFlowContext();

  const handleClick = useCallback(() => {
    flow.abort();
  }, [flow]);

  return (
    <button type="button" onClick={handleClick} {...props}>
      {children}
    </button>
  );
}

/**
 * Props for Flow.Reset component.
 */
export interface FlowResetProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Button content */
  children: ReactNode;
}

/**
 * Reset button that clears all inputs and resets to idle state.
 */
function FlowReset({ children, ...props }: FlowResetProps) {
  const flow = useFlowContext();

  const handleClick = useCallback(() => {
    flow.reset();
  }, [flow]);

  return (
    <button type="button" onClick={handleClick} {...props}>
      {children}
    </button>
  );
}

/**
 * Props for Flow.Pause component.
 */
export interface FlowPauseProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Button content */
  children: React.ReactNode;
}

/**
 * Pause button that pauses the current flow upload.
 * Only visible/enabled when upload is in progress.
 */
function FlowPause({ children, disabled, ...props }: FlowPauseProps) {
  const flow = useFlowContext();

  const handleClick = useCallback(() => {
    flow.pause();
  }, [flow]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || !flow.isUploading}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Props for Flow.Resume component.
 */
export interface FlowResumeProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Button content */
  children: React.ReactNode;
}

/**
 * Resume button that resumes a paused flow upload.
 * Only visible/enabled when upload is paused.
 */
function FlowResume({ children, disabled, ...props }: FlowResumeProps) {
  const flow = useFlowContext();

  const handleClick = useCallback(() => {
    flow.resume();
  }, [flow]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || !flow.isPaused}
      {...props}
    >
      {children}
    </button>
  );
}

// ============ COMPOUND COMPONENT EXPORT ============

/**
 * Flow compound component for flow-based file uploads.
 *
 * Provides a composable, headless API for building flow upload interfaces.
 * All sub-components use render props for complete UI control.
 *
 * @example Simple Drop Zone
 * ```tsx
 * <Flow flowId="image-optimizer" storageId="s3" onSuccess={handleSuccess}>
 *   <Flow.DropZone accept="image/*">
 *     {({ isDragging, progress, getRootProps, getInputProps }) => (
 *       <div {...getRootProps()}>
 *         <input {...getInputProps()} />
 *         {isDragging ? "Drop here" : "Drag or click"}
 *         {progress > 0 && <progress value={progress} max={100} />}
 *       </div>
 *     )}
 *   </Flow.DropZone>
 * </Flow>
 * ```
 *
 * @example Multi-Input Flow
 * ```tsx
 * <Flow flowId="video-processor" storageId="s3">
 *   <Flow.Inputs>
 *     {({ inputs }) => inputs.map(input => (
 *       <Flow.Input key={input.nodeId} nodeId={input.nodeId}>
 *         {({ metadata }) => (
 *           <div>
 *             <label>{metadata.nodeName}</label>
 *             <Flow.Input.DropZone accept="video/*">
 *               {({ getRootProps, getInputProps }) => (
 *                 <div {...getRootProps()}>
 *                   <input {...getInputProps()} />
 *                 </div>
 *               )}
 *             </Flow.Input.DropZone>
 *           </div>
 *         )}
 *       </Flow.Input>
 *     ))}
 *   </Flow.Inputs>
 *   <Flow.Submit>Process</Flow.Submit>
 * </Flow>
 * ```
 */
export const Flow = Object.assign(FlowRoot, {
  DropZone: FlowDropZone,
  Inputs: FlowInputs,
  Input: Object.assign(FlowInput, {
    DropZone: FlowInputDropZone,
    UrlField: FlowInputUrlField,
    Preview: FlowInputPreview,
  }),
  Progress: FlowProgress,
  Status: FlowStatus,
  Error: FlowError,
  Submit: FlowSubmit,
  Cancel: FlowCancel,
  Pause: FlowPause,
  Resume: FlowResume,
  Reset: FlowReset,
});
