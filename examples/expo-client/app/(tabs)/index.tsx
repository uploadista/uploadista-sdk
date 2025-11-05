import type { UploadFile } from "@uploadista/core/types";
import { useFileUpload } from "@uploadista/react-native-core";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import Button from "@/components/ui/Button";
import FilePreview from "@/components/ui/FilePreview";
import ProgressCard from "@/components/ui/ProgressCard";

export default function SingleUploadScreen() {
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: number;
    uri: string;
  } | null>(null);
  const [previewFile, setPreviewFile] = useState<UploadFile | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  console.log("[SingleUpload] Screen mounted");

  const { pickAndUpload, state, abort } = useFileUpload({
    onSuccess: () => {
      console.log("[SingleUpload] Upload SUCCESS");
      Alert.alert("Success", "File uploaded successfully!");
    },
    onError: (error) => {
      console.error("[SingleUpload] Upload ERROR:", error);
      console.error("[SingleUpload] Error details:", {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
      Alert.alert("Error", `Upload failed: ${error.message}`);
    },
    onProgress: (progress) => {
      console.log("[SingleUpload] Progress:", progress);
    },
  });

  console.log("[SingleUpload] Current state:", state);

  const handlePickFile = async () => {
    console.log("[SingleUpload] Pick file button pressed");
    try {
      console.log("[SingleUpload] Calling pickAndUpload...");
      await pickAndUpload?.();
      console.log("[SingleUpload] pickAndUpload completed");
    } catch (error) {
      console.error("[SingleUpload] Failed to pick file:", error);
      Alert.alert("Error", `Failed to pick file: ${error}`);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    abort?.();
  };

  const handlePreview = () => {
    if (state.result) {
      setPreviewFile(state.result);
      setPreviewVisible(true);
    }
  };

  const handleClosePreview = () => {
    setPreviewVisible(false);
    setPreviewFile(null);
  };

  const handleUpload = async () => {
    try {
      if (state.status === "uploading") {
        abort?.();
      }
    } catch (error) {
      Alert.alert("Error", `Upload failed: ${error}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
      >
        <ThemedText style={styles.title}>Single File Upload</ThemedText>

        <ThemedView variant="section">
          <ThemedText type="sectionTitle">Select File</ThemedText>
          {selectedFile ? (
            <ThemedView variant="card">
              <ThemedText style={styles.fileName}>
                {selectedFile.name}
              </ThemedText>
              <ThemedText type="infoText">
                {(selectedFile.size / 1024).toFixed(2)} KB
              </ThemedText>
            </ThemedView>
          ) : (
            <ThemedText type="helperText" style={styles.placeholder}>
              No file selected
            </ThemedText>
          )}
          <Button
            title="Pick File"
            onPress={handlePickFile}
            variant="secondary"
            style={styles.button}
          />
        </ThemedView>

        {(state.status === "uploading" ||
          state.status === "success" ||
          state.status === "error") && (
          <ThemedView variant="section">
            <ThemedText type="sectionTitle">Upload Progress</ThemedText>
            <ProgressCard
              fileName={selectedFile?.name || "Unknown file"}
              progress={state.progress}
              status={state.status}
              fileSize={state.totalBytes || selectedFile?.size}
              error={state.error?.message}
              onRemove={
                state.status !== "uploading" ? handleClearFile : undefined
              }
              onPreview={state.result ? handlePreview : undefined}
            />
          </ThemedView>
        )}

        <ThemedView variant="section">
          <Button
            title={
              state.status === "uploading" ? "Cancel Upload" : "Start Upload"
            }
            onPress={
              state.status === "uploading" ? () => abort?.() : handleUpload
            }
            loading={state.status === "uploading"}
            disabled={!selectedFile}
            style={styles.button}
          />
        </ThemedView>

        {state.status === "success" && (
          <ThemedView variant="successBox">
            <ThemedText type="successText">
              ✓ File uploaded successfully!
            </ThemedText>
          </ThemedView>
        )}

        {state.error && (
          <ThemedView variant="errorBox">
            <ThemedText type="errorText">✗ {state.error.message}</ThemedText>
          </ThemedView>
        )}

        <ThemedView variant="infoSection">
          <ThemedText style={styles.infoTitle}>About Single Upload</ThemedText>
          <ThemedText type="infoText">
            Single file upload demonstrates the basic upload flow. Pick a file
            and start the upload to see progress tracking in action.
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
  fileName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  placeholder: {
    marginBottom: 12,
  },
  button: {
    marginTop: 12,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
  },
});
