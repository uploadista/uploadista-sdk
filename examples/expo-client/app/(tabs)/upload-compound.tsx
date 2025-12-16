import type { UploadFile } from "@uploadista/core/types";
import {
  Upload,
  type UploadCancelRenderProps,
  type UploadCameraPickerRenderProps,
  type UploadCompoundProgressRenderProps,
  type UploadErrorRenderProps,
  type UploadFilePickerRenderProps,
  type UploadGalleryPickerRenderProps,
  type UploadItemsRenderProps,
  type UploadRenderProps,
  type UploadResetRenderProps,
  type UploadRetryRenderProps,
  type UploadStartAllRenderProps,
  type UploadStatusRenderProps,
} from "@uploadista/expo";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import Button from "@/components/ui/Button";
import FilePreview from "@/components/ui/FilePreview";
import ProgressCard from "@/components/ui/ProgressCard";

/**
 * UploadCompoundScreen - Demonstrates the Upload compound component pattern
 * This uses declarative compound components for building custom upload UIs
 */
export default function UploadCompoundScreen() {
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
        <ThemedText style={styles.title}>Upload (Compound)</ThemedText>

        <ThemedView variant="infoSection">
          <ThemedText style={styles.infoTitle}>About Compound Pattern</ThemedText>
          <ThemedText type="infoText">
            The Upload compound component provides composable primitives for
            building custom upload interfaces. Each sub-component handles a
            specific concern and can be styled and arranged freely.
          </ThemedText>
        </ThemedView>

        {/* Upload Compound Component */}
        <Upload
          multiple
          maxConcurrent={3}
          autoStart={false}
          onSuccess={(result: UploadFile) => {
            console.log("[UploadCompound] Upload SUCCESS", result);
          }}
          onError={(error: Error) => {
            console.error("[UploadCompound] Upload ERROR", error);
            Alert.alert("Error", `Upload failed: ${error.message}`);
          }}
          onComplete={(results) => {
            console.log("[UploadCompound] All uploads complete", results);
            if (results.successful > 0) {
              Alert.alert(
                "Complete",
                `${results.successful}/${results.total} files uploaded successfully!`,
              );
            }
          }}
        >
          {({ state }: UploadRenderProps) => (
            <>
              {/* File Pickers Section */}
              <ThemedView variant="section">
                <ThemedText type="sectionTitle">Select Files</ThemedText>

                <View style={styles.pickerRow}>
                  {/* Gallery Picker */}
                  <Upload.GalleryPicker>
                    {({ pick, isLoading }: UploadGalleryPickerRenderProps) => (
                      <Button
                        title="Gallery"
                        onPress={pick}
                        disabled={isLoading}
                        variant="secondary"
                        style={styles.pickerButton}
                      />
                    )}
                  </Upload.GalleryPicker>

                  {/* Camera Picker */}
                  <Upload.CameraPicker>
                    {({ take, isLoading }: UploadCameraPickerRenderProps) => (
                      <Button
                        title="Camera"
                        onPress={take}
                        disabled={isLoading}
                        variant="secondary"
                        style={styles.pickerButton}
                      />
                    )}
                  </Upload.CameraPicker>

                  {/* File Picker */}
                  <Upload.FilePicker>
                    {({ pick, isLoading }: UploadFilePickerRenderProps) => (
                      <Button
                        title="Files"
                        onPress={pick}
                        disabled={isLoading}
                        variant="secondary"
                        style={styles.pickerButton}
                      />
                    )}
                  </Upload.FilePicker>
                </View>
              </ThemedView>

              {/* Progress Overview */}
              <Upload.Progress>
                {({
                  progress,
                  bytesUploaded,
                  totalBytes,
                  isUploading,
                }: UploadCompoundProgressRenderProps) =>
                  (state.items.length > 0 || isUploading) && (
                    <ThemedView variant="section">
                      <ThemedText type="sectionTitle">Progress</ThemedText>
                      <ThemedView style={styles.statsContainer}>
                        <ThemedView variant="statBox">
                          <ThemedText style={styles.statValue}>
                            {progress}%
                          </ThemedText>
                          <ThemedText style={styles.statLabel}>
                            Progress
                          </ThemedText>
                        </ThemedView>
                        <ThemedView variant="statBox">
                          <ThemedText style={styles.statValue}>
                            {(bytesUploaded / 1024 / 1024).toFixed(1)}
                          </ThemedText>
                          <ThemedText style={styles.statLabel}>MB Sent</ThemedText>
                        </ThemedView>
                        <ThemedView variant="statBox">
                          <ThemedText style={styles.statValue}>
                            {(totalBytes / 1024 / 1024).toFixed(1)}
                          </ThemedText>
                          <ThemedText style={styles.statLabel}>
                            MB Total
                          </ThemedText>
                        </ThemedView>
                      </ThemedView>

                      {/* Progress Bar */}
                      <View style={styles.progressBarContainer}>
                        <View
                          style={[
                            styles.progressBarFill,
                            { width: `${progress}%` },
                          ]}
                        />
                      </View>
                    </ThemedView>
                  )
                }
              </Upload.Progress>

              {/* Status Overview */}
              <Upload.Status>
                {({
                  total,
                  successful,
                  failed,
                  active,
                }: UploadStatusRenderProps) =>
                  total > 0 && (
                    <ThemedView variant="section">
                      <View style={styles.statusRow}>
                        <View style={styles.statusItem}>
                          <View
                            style={[styles.statusDot, { backgroundColor: "#007AFF" }]}
                          />
                          <ThemedText style={styles.statusText}>
                            Active: {active}
                          </ThemedText>
                        </View>
                        <View style={styles.statusItem}>
                          <View
                            style={[styles.statusDot, { backgroundColor: "#34C759" }]}
                          />
                          <ThemedText style={styles.statusText}>
                            Done: {successful}
                          </ThemedText>
                        </View>
                        <View style={styles.statusItem}>
                          <View
                            style={[styles.statusDot, { backgroundColor: "#FF3B30" }]}
                          />
                          <ThemedText style={styles.statusText}>
                            Failed: {failed}
                          </ThemedText>
                        </View>
                      </View>
                    </ThemedView>
                  )
                }
              </Upload.Status>

              {/* Action Buttons */}
              {state.items.length > 0 && (
                <ThemedView variant="section">
                  <View style={styles.actionRow}>
                    <Upload.StartAll>
                      {({
                        start,
                        disabled,
                      }: UploadStartAllRenderProps) => (
                        <Button
                          title="Start All"
                          onPress={start}
                          disabled={disabled}
                          variant="primary"
                          style={styles.actionButton}
                        />
                      )}
                    </Upload.StartAll>

                    <Upload.Cancel>
                      {({ cancel, disabled }: UploadCancelRenderProps) => (
                        <Button
                          title="Cancel"
                          onPress={cancel}
                          disabled={disabled}
                          variant="danger"
                          style={styles.actionButton}
                        />
                      )}
                    </Upload.Cancel>
                  </View>

                  <View style={styles.actionRow}>
                    <Upload.Retry>
                      {({ retry, disabled }: UploadRetryRenderProps) => (
                        <Button
                          title="Retry Failed"
                          onPress={retry}
                          disabled={disabled}
                          variant="secondary"
                          style={styles.actionButton}
                        />
                      )}
                    </Upload.Retry>

                    <Upload.Reset>
                      {({ reset }: UploadResetRenderProps) => (
                        <Button
                          title="Clear All"
                          onPress={reset}
                          variant="secondary"
                          style={styles.actionButton}
                        />
                      )}
                    </Upload.Reset>
                  </View>
                </ThemedView>
              )}

              {/* File List */}
              <Upload.Items>
                {({ items, isEmpty }: UploadItemsRenderProps) =>
                  !isEmpty ? (
                    <ThemedView variant="section">
                      <ThemedText type="sectionTitle">
                        Upload Queue ({items.length})
                      </ThemedText>
                      {items.map((item) => (
                        <Upload.Item key={item.id} id={item.id}>
                          {({ file, state: itemState, remove }) => (
                            <ProgressCard
                              fileName={file.data.name || `File ${item.id.substring(0, 8)}`}
                              progress={itemState.progress}
                              status={
                                itemState.status === "aborted"
                                  ? "error"
                                  : (itemState.status as
                                      | "idle"
                                      | "uploading"
                                      | "success"
                                      | "error")
                              }
                              fileSize={itemState.totalBytes}
                              error={itemState.error?.message}
                              onRemove={remove}
                              onPreview={
                                itemState.result
                                  ? () => handlePreview(itemState.result!)
                                  : undefined
                              }
                            />
                          )}
                        </Upload.Item>
                      ))}
                    </ThemedView>
                  ) : (
                    <ThemedView style={styles.emptyState}>
                      <ThemedText style={styles.emptyText}>
                        No files selected
                      </ThemedText>
                      <ThemedText type="infoText" style={styles.emptySubtext}>
                        Use the buttons above to select files
                      </ThemedText>
                    </ThemedView>
                  )
                }
              </Upload.Items>

              {/* Error Display */}
              <Upload.Error>
                {({
                  hasError,
                  failedCount,
                  failedItems,
                }: UploadErrorRenderProps) =>
                  hasError && (
                    <ThemedView variant="section" style={styles.errorSection}>
                      <ThemedText style={styles.errorTitle}>
                        {failedCount} Upload(s) Failed
                      </ThemedText>
                      {failedItems.map((item) => (
                        <ThemedText key={item.id} style={styles.errorItem}>
                          • {item.file.data.name}:{" "}
                          {item.error?.message || "Unknown error"}
                        </ThemedText>
                      ))}
                    </ThemedView>
                  )
                }
              </Upload.Error>
            </>
          )}
        </Upload>
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
  infoTitle: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  pickerRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  pickerButton: {
    flex: 1,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#007AFF",
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
    color: "#666",
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: "#E5E5EA",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#007AFF",
    borderRadius: 4,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 14,
    color: "#666",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  actionButton: {
    flex: 1,
  },
  emptyState: {
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#999",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
  },
  errorSection: {
    backgroundColor: "#FFF3F3",
    borderColor: "#FFD5D5",
    borderWidth: 1,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FF3B30",
    marginBottom: 8,
  },
  errorItem: {
    fontSize: 14,
    color: "#FF3B30",
    marginBottom: 4,
  },
});
