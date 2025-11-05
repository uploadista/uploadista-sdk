import type { UploadFile } from "@uploadista/core/types";
import { useMultiUpload } from "@uploadista/react-native-core";
import { useState } from "react";
import { Alert, FlatList, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import Button from "../../components/ui/Button";
import FilePreview from "../../components/ui/FilePreview";
import ProgressCard from "../../components/ui/ProgressCard";

export default function MultiUploadScreen() {
  const [previewFile, setPreviewFile] = useState<UploadFile | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  console.log("[MultiUpload] Screen mounted");

  const { state, removeItem, clear } = useMultiUpload({
    onSuccess: () => {
      console.log("[MultiUpload] All uploads SUCCESS");
      Alert.alert("Success", "All files uploaded successfully!");
    },
    onError: (error) => {
      console.error("[MultiUpload] Upload ERROR:", error);
      console.error("[MultiUpload] Error details:", {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
      Alert.alert("Error", `Upload failed: ${error.message}`);
    },
  });

  console.log("[MultiUpload] Current state:", state);

  const handleAddFiles = () => {
    console.log("[MultiUpload] Add files button pressed");
    try {
      // In a real implementation, you would use a file picker here
      // and then call addFiles with the results
      console.log("[MultiUpload] File picker not yet implemented");
      Alert.alert("Add Files", "Implement file picker integration");
    } catch (error) {
      console.error("[MultiUpload] Failed to add files:", error);
      Alert.alert("Error", `Failed to add files: ${error}`);
    }
  };

  const handleRemoveItem = (id: string) => {
    removeItem?.(id);
  };

  const handleClearAll = () => {
    clear?.();
  };

  const handlePreview = (result: UploadFile | null) => {
    if (result) {
      setPreviewFile(result);
      setPreviewVisible(true);
    }
  };

  const handleClosePreview = () => {
    setPreviewVisible(false);
    setPreviewFile(null);
  };

  const items = state.items || [];
  const totalProgress =
    items.length > 0
      ? Math.round(
          items.reduce((sum, item) => sum + (item.progress || 0), 0) /
            items.length,
        )
      : 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
      >
        <ThemedText style={styles.title}>Multiple File Upload</ThemedText>

        <ThemedView variant="section">
          <ThemedView style={styles.statsContainer}>
            <ThemedView variant="statBox">
              <ThemedText style={styles.statValue}>{items.length}</ThemedText>
              <ThemedText style={styles.statLabel}>Files</ThemedText>
            </ThemedView>
            <ThemedView variant="statBox">
              <ThemedText style={styles.statValue}>{totalProgress}%</ThemedText>
              <ThemedText style={styles.statLabel}>Progress</ThemedText>
            </ThemedView>
          </ThemedView>
        </ThemedView>

        <ThemedView variant="section">
          <Button
            title="Add Files"
            onPress={handleAddFiles}
            variant="secondary"
            style={styles.button}
          />
        </ThemedView>

        {items.length > 0 && (
          <ThemedView variant="section">
            <ThemedText type="sectionTitle">
              Uploads ({items.length})
            </ThemedText>
            <FlatList
              scrollEnabled={false}
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ProgressCard
                  fileName={
                    item.file?.data?.name || `File ${item.id.substring(0, 8)}`
                  }
                  progress={item.progress || 0}
                  status={
                    (item.status === "aborted" ? "error" : item.status) as
                      | "idle"
                      | "uploading"
                      | "success"
                      | "error"
                      | undefined
                  }
                  fileSize={item.totalBytes}
                  onRemove={() => handleRemoveItem(item.id)}
                  onPreview={
                    item.result ? () => handlePreview(item.result) : undefined
                  }
                  error={item.error?.message}
                />
              )}
            />
          </ThemedView>
        )}

        {items.length > 0 && (
          <ThemedView variant="section">
            <Button
              title="Clear All"
              onPress={handleClearAll}
              variant="danger"
              style={styles.button}
            />
          </ThemedView>
        )}

        {items.length === 0 && (
          <ThemedView style={styles.emptyState}>
            <ThemedText style={styles.emptyText}>No files selected</ThemedText>
            <ThemedText type="infoText" style={styles.emptySubtext}>
              Tap "Add Files" to get started
            </ThemedText>
          </ThemedView>
        )}

        <ThemedView variant="infoSection">
          <ThemedText style={styles.infoTitle}>About Multi Upload</ThemedText>
          <ThemedText type="infoText">
            Multi file upload allows you to select and upload multiple files
            simultaneously. Track progress for each file and the overall batch.
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
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#007AFF",
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  button: {
    marginTop: 12,
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
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
  },
});
