import { useCameraUpload } from "@uploadista/react-native-core";
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

export default function CameraUploadScreen() {
  const { captureAndUpload, state, abort } = useCameraUpload({
    flowId: "camera-flow",
  });

  const handleCapture = async () => {
    try {
      await captureAndUpload?.();
      // Photo capture and upload initiated through the hook
    } catch (error) {
      Alert.alert("Camera Error", `Failed to capture: ${error}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.title}>Camera Upload</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Camera Capture</Text>
          <View style={styles.previewContainer}>
            <View style={styles.previewPlaceholder}>
              <Text style={styles.previewText}>📷</Text>
              <Text style={styles.previewLabel}>
                {state.status === "success"
                  ? "Photo uploaded!"
                  : "No photo captured"}
              </Text>
            </View>
          </View>
          <Button
            title={
              state.status === "uploading" ? "Uploading..." : "Capture & Upload"
            }
            onPress={handleCapture}
            loading={state.status === "uploading"}
            style={styles.button}
          />
        </View>

        {state.progress > 0 && state.status !== "idle" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upload Progress</Text>
            <ProgressCard
              fileName="camera-photo.jpg"
              progress={state.progress}
              status={
                (state.status === "aborted" ? "error" : state.status) as
                  | "idle"
                  | "uploading"
                  | "success"
                  | "error"
                  | undefined
              }
              error={state.error?.message}
            />
            {state.status === "uploading" && (
              <Button
                title="Cancel"
                onPress={() => abort?.()}
                variant="danger"
                style={styles.button}
              />
            )}
          </View>
        )}

        {state.status === "success" && (
          <View style={styles.successBox}>
            <Text style={styles.successText}>
              ✓ Photo uploaded successfully!
            </Text>
          </View>
        )}

        {state.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>✗ {state.error.message}</Text>
          </View>
        )}

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>About Camera Upload</Text>
          <Text style={styles.infoText}>
            Camera upload allows you to capture a photo directly from your
            device's camera and immediately upload it. Perfect for quick photo
            submissions.
          </Text>
          <Text style={styles.infoNote}>
            Note: Camera access requires permission. The app will request
            permission when needed.
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
  previewContainer: {
    marginBottom: 16,
  },
  preview: {
    width: "100%",
    height: 300,
    borderRadius: 8,
    backgroundColor: "#f5f5f5",
  },
  previewPlaceholder: {
    width: "100%",
    height: 300,
    borderRadius: 8,
    backgroundColor: "#f5f5f5",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#ddd",
    justifyContent: "center",
    alignItems: "center",
  },
  previewText: {
    fontSize: 64,
    marginBottom: 8,
  },
  previewLabel: {
    fontSize: 14,
    color: "#999",
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
    marginBottom: 8,
  },
  infoNote: {
    fontSize: 11,
    color: "#bbb",
    fontStyle: "italic",
  },
});
