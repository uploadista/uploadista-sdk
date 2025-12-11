import type {
  FlowUploadState,
  FlowUploadStatus,
  InputExecutionState,
} from "@uploadista/client-core";
import type { TypedOutput } from "@uploadista/core/flow";
import { createContext, type ReactNode, useCallback, useContext } from "react";
import {
  type FlowInputMetadata,
  type UseFlowOptions,
  useFlow,
} from "../hooks/use-flow";
import { useUploadistaContext } from "../hooks/use-uploadista-context";
import type { FilePickResult } from "../types";

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
  upload: (file: FilePickResult) => Promise<void>;
  /** Abort the current upload */
  abort: () => void;
  /** Reset the upload state and clear all inputs */
  reset: () => void;

  /** Whether an upload or flow execution is in progress */
  isActive: boolean;
  /** Whether the file is currently being uploaded */
  isUploadingFile: boolean;
  /** Whether the flow is currently processing */
  isProcessing: boolean;
  /** Whether the hook is discovering flow inputs */
  isDiscoveringInputs: boolean;

  /** Pick a file and set it for a specific input node */
  pickFileForInput: (nodeId: string) => Promise<void>;
  /** Pick a file and start upload immediately (single-file flows) */
  pickAndUpload: () => Promise<void>;
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
  /** Pick a file for this input */
  pickFile: () => Promise<void>;
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
 * Render props for the Flow root component.
 */
export interface FlowRenderProps extends FlowContextValue {
  /** Alias for execute() */
  submit: () => Promise<void>;
  /** Alias for abort() */
  cancel: () => void;
}

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
    progress: number,
    bytesUploaded: number,
    totalBytes: number | null,
  ) => void;
  /** Called when flow completes with all outputs */
  onFlowComplete?: (outputs: TypedOutput[]) => void;
  /** Children to render (can be render function or ReactNode) */
  children: ReactNode | ((props: FlowRenderProps) => ReactNode);
}

/**
 * Root component for flow-based uploads on React Native.
 * Provides context for all Flow sub-components.
 *
 * @example
 * ```tsx
 * <Flow flowId="image-optimizer" storageId="s3" onSuccess={handleSuccess}>
 *   <Flow.Inputs>
 *     {({ inputs, isLoading }) => (
 *       inputs.map(input => (
 *         <Flow.Input key={input.nodeId} nodeId={input.nodeId}>
 *           {({ metadata, pickFile }) => (
 *             <Button onPress={pickFile} title={metadata.nodeName} />
 *           )}
 *         </Flow.Input>
 *       ))
 *     )}
 *   </Flow.Inputs>
 *   <Flow.Submit>
 *     <Text>Process</Text>
 *   </Flow.Submit>
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
  children,
}: FlowProps) {
  const { fileSystemProvider } = useUploadistaContext();

  const options: UseFlowOptions = {
    flowId,
    storageId,
    outputNodeId,
    metadata,
    onSuccess,
    onError,
    onProgress,
    onFlowComplete,
  };

  const flow = useFlow(options);

  // Pick a file for a specific input node
  const pickFileForInput = useCallback(
    async (nodeId: string) => {
      if (!fileSystemProvider?.pickDocument) {
        throw new Error("File picker not available");
      }
      const result = await fileSystemProvider.pickDocument();
      if (result.status === "success") {
        flow.setInput(nodeId, result);
      }
    },
    [fileSystemProvider, flow],
  );

  // Pick a file and start upload immediately
  const pickAndUpload = useCallback(async () => {
    if (!fileSystemProvider?.pickDocument) {
      throw new Error("File picker not available");
    }
    const result = await fileSystemProvider.pickDocument();
    if (result.status === "success") {
      await flow.upload(result);
    }
  }, [fileSystemProvider, flow]);

  const contextValue: FlowContextValue = {
    state: flow.state,
    inputMetadata: flow.inputMetadata,
    inputs: flow.inputs,
    inputStates: flow.inputStates,
    setInput: flow.setInput,
    execute: flow.execute,
    upload: flow.upload,
    abort: flow.abort,
    reset: flow.reset,
    isActive: flow.isActive,
    isUploadingFile: flow.isUploadingFile,
    isProcessing: flow.isProcessing,
    isDiscoveringInputs: flow.isDiscoveringInputs,
    pickFileForInput,
    pickAndUpload,
  };

  const renderProps: FlowRenderProps = {
    ...contextValue,
    submit: flow.execute,
    cancel: flow.abort,
  };

  return (
    <FlowContext.Provider value={contextValue}>
      {typeof children === "function" ? children(renderProps) : children}
    </FlowContext.Provider>
  );
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
 *     isLoading ? <ActivityIndicator /> : (
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
 *   {({ metadata, value, pickFile }) => (
 *     <View>
 *       <Text>{metadata.nodeName}</Text>
 *       <Button onPress={pickFile} title="Select File" />
 *       {value && <Text>Selected: {value.data?.name}</Text>}
 *     </View>
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

  const pickFile = async () => {
    await flow.pickFileForInput(nodeId);
  };

  const contextValue: FlowInputContextValue = {
    nodeId,
    metadata,
    value: flow.inputs[nodeId],
    setValue: (value) => flow.setInput(nodeId, value),
    state: flow.inputStates.get(nodeId),
    pickFile,
  };

  return (
    <FlowInputContext.Provider value={contextValue}>
      {typeof children === "function" ? children(contextValue) : children}
    </FlowInputContext.Provider>
  );
}

// ============ INPUT FILE PICKER PRIMITIVE ============

/**
 * Render props for Flow.Input.FilePicker component.
 */
export interface FlowInputFilePickerRenderProps {
  /** Current value for this input */
  value: unknown;
  /** Whether a file is selected */
  hasFile: boolean;
  /** File name (if value is FilePickResult) */
  fileName: string | null;
  /** File size in bytes (if value is FilePickResult) */
  fileSize: number | null;
  /** Per-input progress (if available) */
  progress: number;
  /** Per-input status (if available) */
  status: string;
  /** Open file picker */
  pickFile: () => Promise<void>;
  /** Clear the input value */
  clear: () => void;
}

/**
 * Props for Flow.Input.FilePicker component.
 */
export interface FlowInputFilePickerProps {
  /** Render function receiving file picker state */
  children: (props: FlowInputFilePickerRenderProps) => ReactNode;
}

/**
 * File picker for a specific input within a Flow.Input.
 * Sets the input value but does NOT trigger upload until Flow.Submit is pressed.
 */
function FlowInputFilePicker({ children }: FlowInputFilePickerProps) {
  const input = useFlowInputContext();

  // Check if value is a FilePickResult
  const fileResult = input.value as FilePickResult | undefined;
  const hasFile = fileResult?.status === "success";
  const fileName = hasFile ? (fileResult?.data?.name ?? null) : null;
  const fileSize = hasFile ? (fileResult?.data?.size ?? null) : null;

  const renderProps: FlowInputFilePickerRenderProps = {
    value: input.value,
    hasFile,
    fileName,
    fileSize,
    progress: input.state?.progress ?? 0,
    status: input.state?.status ?? "idle",
    pickFile: input.pickFile,
    clear: () => input.setValue(undefined),
  };

  return <>{children(renderProps)}</>;
}

// ============ INPUT PREVIEW PRIMITIVE ============

/**
 * Render props for Flow.Input.Preview component.
 */
export interface FlowInputPreviewRenderProps {
  /** Current value */
  value: unknown;
  /** Whether a file is selected */
  hasFile: boolean;
  /** Whether value is a URL string */
  isUrl: boolean;
  /** File name (if value is FilePickResult) */
  fileName: string | null;
  /** File size in bytes (if value is FilePickResult) */
  fileSize: number | null;
  /** File URI (if value is FilePickResult) */
  fileUri: string | null;
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

  // Check if value is a FilePickResult
  const fileResult = input.value as FilePickResult | undefined;
  const hasFile = fileResult?.status === "success";
  const isUrl =
    typeof input.value === "string" && (input.value as string).length > 0;

  const renderProps: FlowInputPreviewRenderProps = {
    value: input.value,
    hasFile,
    isUrl,
    fileName: hasFile ? (fileResult?.data?.name ?? null) : null,
    fileSize: hasFile ? (fileResult?.data?.size ?? null) : null,
    fileUri: hasFile ? (fileResult?.data?.uri ?? null) : null,
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
 * Render props for Flow.Submit component.
 */
export interface FlowSubmitRenderProps {
  /** Execute the flow */
  submit: () => Promise<void>;
  /** Whether the button should be disabled */
  isDisabled: boolean;
  /** Whether currently submitting */
  isSubmitting: boolean;
}

/**
 * Props for Flow.Submit component.
 */
export interface FlowSubmitProps {
  /** Render function receiving submit state */
  children: ReactNode | ((props: FlowSubmitRenderProps) => ReactNode);
  /** Additional disabled state */
  disabled?: boolean;
}

/**
 * Submit primitive that executes the flow with current inputs.
 * Provides render props for building custom submit buttons.
 * Automatically disabled when uploading.
 */
function FlowSubmit({ children, disabled }: FlowSubmitProps) {
  const flow = useFlowContext();

  const renderProps: FlowSubmitRenderProps = {
    submit: flow.execute,
    isDisabled: disabled || flow.isActive || Object.keys(flow.inputs).length === 0,
    isSubmitting: flow.isActive,
  };

  return <>{typeof children === "function" ? children(renderProps) : children}</>;
}

/**
 * Render props for Flow.Cancel component.
 */
export interface FlowCancelRenderProps {
  /** Cancel the flow */
  cancel: () => void;
  /** Whether the button should be disabled */
  isDisabled: boolean;
}

/**
 * Props for Flow.Cancel component.
 */
export interface FlowCancelProps {
  /** Render function receiving cancel state */
  children: ReactNode | ((props: FlowCancelRenderProps) => ReactNode);
}

/**
 * Cancel primitive that aborts the current upload.
 */
function FlowCancel({ children }: FlowCancelProps) {
  const flow = useFlowContext();

  const renderProps: FlowCancelRenderProps = {
    cancel: flow.abort,
    isDisabled: !flow.isActive,
  };

  return <>{typeof children === "function" ? children(renderProps) : children}</>;
}

/**
 * Render props for Flow.Reset component.
 */
export interface FlowResetRenderProps {
  /** Reset the flow */
  reset: () => void;
  /** Whether the button should be disabled */
  isDisabled: boolean;
}

/**
 * Props for Flow.Reset component.
 */
export interface FlowResetProps {
  /** Render function receiving reset state */
  children: ReactNode | ((props: FlowResetRenderProps) => ReactNode);
}

/**
 * Reset primitive that clears all inputs and resets to idle state.
 */
function FlowReset({ children }: FlowResetProps) {
  const flow = useFlowContext();

  const renderProps: FlowResetRenderProps = {
    reset: flow.reset,
    isDisabled: flow.isActive,
  };

  return <>{typeof children === "function" ? children(renderProps) : children}</>;
}

// ============ QUICK UPLOAD PRIMITIVE ============

/**
 * Render props for Flow.QuickUpload component.
 */
export interface FlowQuickUploadRenderProps {
  /** Whether currently uploading */
  isUploading: boolean;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current status */
  status: FlowUploadStatus;
  /** Pick a file and start upload immediately */
  pickAndUpload: () => Promise<void>;
  /** Abort the current upload */
  abort: () => void;
}

/**
 * Props for Flow.QuickUpload component.
 */
export interface FlowQuickUploadProps {
  /** Render function receiving quick upload state */
  children: (props: FlowQuickUploadRenderProps) => ReactNode;
}

/**
 * Quick upload component for single-file flows.
 * Picks a file and starts upload immediately.
 *
 * @example
 * ```tsx
 * <Flow.QuickUpload>
 *   {({ isUploading, progress, pickAndUpload, abort }) => (
 *     <Button
 *       onPress={isUploading ? abort : pickAndUpload}
 *       title={isUploading ? `Uploading ${progress}%` : 'Upload File'}
 *     />
 *   )}
 * </Flow.QuickUpload>
 * ```
 */
function FlowQuickUpload({ children }: FlowQuickUploadProps) {
  const flow = useFlowContext();

  const renderProps: FlowQuickUploadRenderProps = {
    isUploading: flow.isActive,
    progress: flow.state.progress,
    status: flow.state.status,
    pickAndUpload: flow.pickAndUpload,
    abort: flow.abort,
  };

  return <>{children(renderProps)}</>;
}

// ============ COMPOUND COMPONENT EXPORT ============

/**
 * Flow compound component for flow-based file uploads on React Native.
 *
 * Provides a composable, headless API for building flow upload interfaces.
 * All sub-components use render props for complete UI control.
 *
 * @example Quick Upload (Single File)
 * ```tsx
 * <Flow flowId="image-optimizer" storageId="s3" onSuccess={handleSuccess}>
 *   <Flow.QuickUpload>
 *     {({ isUploading, progress, pickAndUpload, abort }) => (
 *       <View>
 *         <Button
 *           onPress={isUploading ? abort : pickAndUpload}
 *           title={isUploading ? 'Cancel' : 'Upload Image'}
 *         />
 *         {isUploading && <Text>{progress}%</Text>}
 *       </View>
 *     )}
 *   </Flow.QuickUpload>
 * </Flow>
 * ```
 *
 * @example Multi-Input Flow
 * ```tsx
 * <Flow flowId="video-processor" storageId="s3">
 *   <Flow.Inputs>
 *     {({ inputs, isLoading }) => (
 *       isLoading ? <ActivityIndicator /> : inputs.map(input => (
 *         <Flow.Input key={input.nodeId} nodeId={input.nodeId}>
 *           {({ metadata, pickFile, value }) => (
 *             <View>
 *               <Text>{metadata.nodeName}</Text>
 *               <Button onPress={pickFile} title="Select File" />
 *               <Flow.Input.Preview>
 *                 {({ hasFile, fileName }) => hasFile && <Text>{fileName}</Text>}
 *               </Flow.Input.Preview>
 *             </View>
 *           )}
 *         </Flow.Input>
 *       ))
 *     )}
 *   </Flow.Inputs>
 *   <CustomSubmitButton />
 * </Flow>
 * ```
 */
export const Flow = Object.assign(FlowRoot, {
  Inputs: FlowInputs,
  Input: Object.assign(FlowInput, {
    FilePicker: FlowInputFilePicker,
    Preview: FlowInputPreview,
  }),
  Progress: FlowProgress,
  Status: FlowStatus,
  Error: FlowError,
  Submit: FlowSubmit,
  Cancel: FlowCancel,
  Reset: FlowReset,
  QuickUpload: FlowQuickUpload,
});
