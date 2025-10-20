import { useFileUpload } from "@uploadista/react-native-core";
import { useState } from "react";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Button from "../../components/ui/Button";
import ProgressCard from "../../components/ui/ProgressCard";

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
        <Text style={styles.title}>Single File Upload</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select File</Text>
          {selectedFile ? (
            <View style={styles.fileInfo}>
              <Text style={styles.fileName}>{selectedFile.name}</Text>
              <Text style={styles.fileSize}>
                {(selectedFile.size / 1024).toFixed(2)} KB
              </Text>
            </View>
          ) : (
            <Text style={styles.placeholder}>No file selected</Text>
          )}
          <Button
            title="Pick File"
            onPress={handlePickFile}
            variant="secondary"
            style={styles.button}
          />
        </View>

        {state.progress > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upload Progress</Text>
            <ProgressCard
              fileName={selectedFile?.name}
              progress={state.progress}
              status={state.status}
              error={state.error?.message}
            />
          </View>
        )}

        <View style={styles.section}>
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
        </View>

        {state.status === "success" && (
          <View style={styles.successBox}>
            <Text style={styles.successText}>
              ✓ File uploaded successfully!
            </Text>
          </View>
        )}

        {state.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>✗ {state.error.message}</Text>
          </View>
        )}

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>About Single Upload</Text>
          <Text style={styles.infoText}>
            Single file upload demonstrates the basic upload flow. Pick a file
            and start the upload to see progress tracking in action.
          </Text>
        </View>
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
    color: "#333",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 12,
    textTransform: "uppercase",
  },
  fileInfo: {
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    marginBottom: 12,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 12,
    color: "#999",
  },
  placeholder: {
    fontSize: 14,
    color: "#999",
    marginBottom: 12,
    fontStyle: "italic",
  },
  button: {
    marginTop: 12,
  },
  successBox: {
    padding: 12,
    backgroundColor: "#e8f5e9",
    borderLeftWidth: 4,
    borderLeftColor: "#4caf50",
    borderRadius: 4,
    marginBottom: 16,
  },
  successText: {
    color: "#2e7d32",
    fontWeight: "600",
  },
  errorBox: {
    padding: 12,
    backgroundColor: "#ffebee",
    borderLeftWidth: 4,
    borderLeftColor: "#d32f2f",
    borderRadius: 4,
    marginBottom: 16,
  },
  errorText: {
    color: "#c62828",
    fontWeight: "600",
  },
  infoSection: {
    padding: 16,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  infoText: {
    fontSize: 13,
    color: "#999",
    lineHeight: 20,
  },
});
