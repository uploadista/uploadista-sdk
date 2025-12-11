import type { TypedOutput } from "@uploadista/core/flow";
import type { UploadFile } from "@uploadista/core/types";
import {
  Flow,
  type FlowCancelRenderProps,
  type FlowInputFilePickerRenderProps,
  type FlowRenderProps,
  type FlowResetRenderProps,
  type FlowSubmitRenderProps,
} from "@uploadista/expo";
import { useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import Button from "@/components/ui/Button";
import FilePreview from "@/components/ui/FilePreview";
import { FLOW_CONFIG } from "@/utils/config";

/**
 * Helper to check if a file is an image based on metadata or storage path
 */
function isImageFile(file: UploadFile | null): boolean {
  if (!file) return false;
  // Check metadata for mime type
  const mimeType = file.metadata?.mimeType as string | undefined;
  if (mimeType?.startsWith("image/")) return true;
  // Check storage path for image extensions
  const path = file.url || file.storage?.path;
  if (path) {
    const ext = path.split(".").pop()?.toLowerCase();
    return ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext || "");
  }
  return false;
}

/**
 * Helper to get file URL for preview
 */
function getPreviewUrl(file: UploadFile | null): string | null {
  if (!file) return null;
  return file.url || file.storage?.path || null;
}

/**
 * Helper to get file name from metadata or path
 */
function getFileName(file: UploadFile | null): string {
  if (!file) return "Unknown file";
  const name = file.metadata?.name as string | undefined;
  if (name) return name;
  const path = file.url || file.storage?.path;
  if (path) return path.split("/").pop() || "Processed file";
  return "Processed file";
}

/**
 * FlowCompoundScreen - Demonstrates the Flow compound component pattern
 * This uses declarative compound components instead of imperative useFlow hook
 */
export default function FlowCompoundScreen() {
  const [flowId, setFlowId] = useState(FLOW_CONFIG.flowId);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadFile | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  const handlePreview = (file: UploadFile) => {
    setPreviewFile(file);
    setPreviewVisible(true);
  };

  const handleClosePreview = () => {
    setPreviewVisible(false);
    setPreviewFile(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
      >
        <ThemedText style={styles.title}>Flow (Compound)</ThemedText>

        {/* Configuration Section */}
        <ThemedView variant="section">
          <ThemedText type="sectionTitle">Configuration</ThemedText>
          <Button
            title={isConfigOpen ? "Hide Config" : "Show Config"}
            onPress={() => setIsConfigOpen(!isConfigOpen)}
            variant="secondary"
            style={styles.button}
          />
        </ThemedView>

        {isConfigOpen && (
          <ThemedView variant="section">
            <ThemedText type="label">Flow ID</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="Enter flow ID"
              value={flowId}
              onChangeText={setFlowId}
            />
            <ThemedText type="helperText">
              The flow ID identifies which processing pipeline to use.
            </ThemedText>
          </ThemedView>
        )}

        {/* Flow Compound Component */}
        <Flow
          flowId={flowId}
          storageId="local"
          onSuccess={(result: TypedOutput[]) => {
            console.log("[FlowCompound] Flow SUCCESS", result);
            Alert.alert("Success", "Flow completed successfully!");
          }}
          onError={(error: Error) => {
            console.error("[FlowCompound] Flow ERROR", error);
            Alert.alert("Error", `Flow failed: ${error.message}`);
          }}
        >
          {({ state, isActive }: FlowRenderProps) => (
            <>
              {/* Flow Inputs Section */}
              <ThemedView variant="section">
                <ThemedText type="sectionTitle">File Input</ThemedText>
                <Flow.Inputs>
                  {({ inputs }) => (
                    <>
                      {inputs.map((input) => (
                        <Flow.Input key={input.nodeId} nodeId={input.nodeId}>
                          {({ metadata, state: inputState }) => (
                            <ThemedView variant="card" style={styles.inputCard}>
                              <ThemedText style={styles.inputLabel}>
                                {metadata?.nodeName || input.nodeId}
                              </ThemedText>

                              {/* File Picker */}
                              <Flow.Input.FilePicker>
                                {({
                                  pickFile,
                                  hasFile,
                                  status,
                                }: FlowInputFilePickerRenderProps) => (
                                  <Button
                                    title={
                                      hasFile ? "Change File" : "Select File"
                                    }
                                    onPress={pickFile}
                                    disabled={
                                      isActive || status === "uploading"
                                    }
                                    variant={hasFile ? "secondary" : "primary"}
                                    style={styles.pickerButton}
                                  />
                                )}
                              </Flow.Input.FilePicker>

                              {/* Preview */}
                              <Flow.Input.Preview>
                                {({ hasFile, fileName, fileSize }) =>
                                  hasFile ? (
                                    <ThemedView style={styles.preview}>
                                      <ThemedText style={styles.previewName}>
                                        {fileName || "Selected file"}
                                      </ThemedText>
                                      {fileSize != null && (
                                        <ThemedText style={styles.previewSize}>
                                          {(fileSize / 1024).toFixed(1)} KB
                                        </ThemedText>
                                      )}
                                    </ThemedView>
                                  ) : null
                                }
                              </Flow.Input.Preview>

                              {/* Input State */}
                              {inputState && (
                                <ThemedText style={styles.inputState}>
                                  Status: {inputState.status}
                                </ThemedText>
                              )}
                            </ThemedView>
                          )}
                        </Flow.Input>
                      ))}
                    </>
                  )}
                </Flow.Inputs>
              </ThemedView>

              {/* Progress Section */}
              <Flow.Progress>
                {({ progress, bytesUploaded, totalBytes, status }) =>
                  status !== "idle" ? (
                    <ThemedView variant="section">
                      <ThemedText type="sectionTitle">Progress</ThemedText>
                      <ThemedView variant="card">
                        <View style={styles.progressContainer}>
                          <View
                            style={[
                              styles.progressBar,
                              { width: `${progress}%` },
                            ]}
                          />
                        </View>
                        <ThemedText style={styles.progressText}>
                          {progress.toFixed(0)}%
                          {totalBytes
                            ? ` (${(bytesUploaded / 1024).toFixed(1)} / ${(totalBytes / 1024).toFixed(1)} KB)`
                            : ""}
                        </ThemedText>
                      </ThemedView>
                    </ThemedView>
                  ) : null
                }
              </Flow.Progress>

              {/* Status Section */}
              <Flow.Status>
                {({ status, currentNodeName, jobId }) =>
                  status !== "idle" ? (
                    <ThemedView variant="section">
                      <ThemedText type="sectionTitle">Status</ThemedText>
                      <ThemedView variant="card">
                        <ThemedText style={styles.statusText}>
                          Status: <Text style={styles.bold}>{status}</Text>
                        </ThemedText>
                        {currentNodeName && (
                          <ThemedText style={styles.statusDetail}>
                            Processing: {currentNodeName}
                          </ThemedText>
                        )}
                        {jobId && (
                          <ThemedText style={styles.statusDetail}>
                            Job ID: {jobId}
                          </ThemedText>
                        )}
                      </ThemedView>
                    </ThemedView>
                  ) : null
                }
              </Flow.Status>

              {/* Error Section */}
              <Flow.Error>
                {({ error }) =>
                  error ? (
                    <ThemedView variant="errorBox" style={styles.errorBox}>
                      <ThemedText type="errorText" style={styles.errorTitle}>
                        Error
                      </ThemedText>
                      <ThemedText type="errorText">{error.message}</ThemedText>
                    </ThemedView>
                  ) : null
                }
              </Flow.Error>

              {/* Results Section */}
              {state.status === "success" && state.flowOutputs && (
                <ThemedView variant="successBox" style={styles.successBox}>
                  <ThemedText type="successText" style={styles.successTitle}>
                    Flow Completed!
                  </ThemedText>
                  <ThemedView style={styles.resultsContainer}>
                    {state.flowOutputs.map(
                      (output: TypedOutput, idx: number) => {
                        const file = output.data as UploadFile;
                        const previewUrl = getPreviewUrl(file);

                        return (
                          <ThemedView
                            key={output.nodeId || `output-${idx}`}
                            variant="card"
                            style={styles.resultCard}
                          >
                            {/* Image Preview */}
                            {isImageFile(file) && previewUrl && (
                              <Image
                                source={{ uri: previewUrl }}
                                style={styles.resultImage}
                                resizeMode="cover"
                              />
                            )}

                            {/* File Info */}
                            <ThemedView style={styles.resultInfo}>
                              <ThemedText style={styles.resultName}>
                                {getFileName(file)}
                              </ThemedText>
                              <ThemedText style={styles.resultMeta}>
                                {output.nodeType}
                              </ThemedText>
                              {file.size != null && (
                                <ThemedText style={styles.resultMeta}>
                                  {(file.size / 1024).toFixed(1)} KB
                                </ThemedText>
                              )}
                            </ThemedView>

                            {/* Preview Button */}
                            <Button
                              title="Preview"
                              onPress={() => handlePreview(file)}
                              variant="secondary"
                              style={styles.resultButton}
                            />
                          </ThemedView>
                        );
                      },
                    )}
                  </ThemedView>
                </ThemedView>
              )}

              {/* Control Buttons */}
              <ThemedView variant="section" style={styles.controls}>
                <View style={styles.buttonRow}>
                  <Flow.Submit>
                    {({
                      submit: handleSubmit,
                      isDisabled,
                      isSubmitting,
                    }: FlowSubmitRenderProps) => (
                      <Button
                        title={isSubmitting ? "Uploading..." : "Upload"}
                        onPress={handleSubmit}
                        disabled={isDisabled}
                        loading={isSubmitting}
                        style={styles.controlButton}
                      />
                    )}
                  </Flow.Submit>

                  <Flow.Cancel>
                    {({
                      cancel: handleCancel,
                      isDisabled,
                    }: FlowCancelRenderProps) => (
                      <Button
                        title="Cancel"
                        onPress={handleCancel}
                        disabled={isDisabled}
                        variant="secondary"
                        style={styles.controlButton}
                      />
                    )}
                  </Flow.Cancel>

                  <Flow.Reset>
                    {({
                      reset: handleReset,
                      isDisabled,
                    }: FlowResetRenderProps) => (
                      <Button
                        title="Reset"
                        onPress={handleReset}
                        disabled={isDisabled}
                        variant="secondary"
                        style={styles.controlButton}
                      />
                    )}
                  </Flow.Reset>
                </View>
              </ThemedView>
            </>
          )}
        </Flow>

        {/* Info Section */}
        <ThemedView variant="infoSection">
          <ThemedText style={styles.infoTitle}>
            About Flow Compound Components
          </ThemedText>
          <ThemedText type="infoText">
            This example uses the declarative Flow compound component pattern.
            Components like Flow.Inputs, Flow.Progress, and Flow.Status provide
            scoped context and render props for building custom UIs.
          </ThemedText>
          <ThemedText type="infoText" style={{ marginTop: 8 }}>
            Compare with the "Flow Upload" tab which uses the imperative useFlow
            hook approach.
          </ThemedText>
        </ThemedView>
      </ScrollView>

      <FilePreview
        visible={previewVisible}
        file={previewFile}
        onClose={handleClosePreview}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 24,
  },
  button: {
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
    backgroundColor: "#f9f9f9",
  },
  inputCard: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  pickerButton: {
    marginBottom: 8,
  },
  preview: {
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    marginTop: 8,
  },
  previewName: {
    fontSize: 14,
    fontWeight: "500",
  },
  previewSize: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  inputState: {
    fontSize: 12,
    color: "#666",
    marginTop: 8,
  },
  progressContainer: {
    height: 8,
    backgroundColor: "#e0e0e0",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#4caf50",
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
  },
  statusText: {
    fontSize: 14,
  },
  statusDetail: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  bold: {
    fontWeight: "700",
  },
  errorBox: {
    marginBottom: 16,
  },
  errorTitle: {
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 8,
  },
  successBox: {
    marginBottom: 16,
  },
  successTitle: {
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 12,
  },
  resultsContainer: {
    marginTop: 8,
  },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  resultImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 14,
    fontWeight: "500",
  },
  resultMeta: {
    fontSize: 11,
    color: "#666",
    marginTop: 2,
  },
  resultButton: {
    marginLeft: 8,
  },
  controls: {
    marginTop: 16,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
  },
  controlButton: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
  },
});
