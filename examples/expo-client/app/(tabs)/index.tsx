import { useFileUpload } from "@uploadista/react-native-core";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "@/components/ui/Button";
import ProgressCard from "@/components/ui/ProgressCard";
import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";

export default function SingleUploadScreen() {
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: number;
  } | null>(null);

  const { pickAndUpload, state, abort } = useFileUpload({
    onSuccess: () => {
      setSelectedFile(null);
      Alert.alert("Success", "File uploaded successfully!");
    },
    onError: (error) => {
      Alert.alert("Error", `Upload failed: ${error.message}`);
    },
  });

  const handlePickFile = async () => {
    try {
      await pickAndUpload?.();
      // File was selected and upload started
      setSelectedFile({ name: "Uploading...", size: 0 });
    } catch (error) {
      Alert.alert("Error", `Failed to pick file: ${error}`);
    }
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
              <ThemedText style={styles.fileName}>{selectedFile.name}</ThemedText>
              <ThemedText type="infoText">
                {(selectedFile.size / 1024).toFixed(2)} KB
              </ThemedText>
            </ThemedView>
          ) : (
            <ThemedText type="helperText" style={styles.placeholder}>No file selected</ThemedText>
          )}
          <Button
            title="Pick File"
            onPress={handlePickFile}
            variant="secondary"
            style={styles.button}
          />
        </ThemedView>

        {state.progress > 0 && (
          <ThemedView variant="section">
            <ThemedText type="sectionTitle">Upload Progress</ThemedText>
            <ProgressCard
              fileName={selectedFile?.name}
              progress={state.progress}
              status={state.status}
              error={state.error?.message}
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
