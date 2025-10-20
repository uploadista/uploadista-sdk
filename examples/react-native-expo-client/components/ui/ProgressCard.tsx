import type { UploadStatus } from "@uploadista/react-native-core";
import * as Progress from "expo-progress";
import { StyleSheet } from "react-native";
import { ThemedText } from "../themed-text";
import { ThemedView } from "../themed-view";

interface ProgressCardProps {
  fileName?: string;
  progress?: number;
  status?: UploadStatus | "processing";
  speed?: string;
  eta?: string;
  error?: string;
}

export default function ProgressCard({
  fileName,
  progress = 0,
  status = "idle",
  speed,
  eta,
  error,
}: ProgressCardProps) {
  const progressValue = Math.max(0, Math.min(1, (progress || 0) / 100));

  return (
    <ThemedView style={styles.card}>
      {fileName && <ThemedText style={styles.fileName}>{fileName}</ThemedText>}

      <ThemedView style={styles.progressContainer}>
        <Progress.Bar progress={progressValue} style={styles.progressBar} />
      </ThemedView>

      <ThemedView style={styles.statsContainer}>
        <ThemedText style={styles.progress}>
          {Math.round(progress || 0)}%
        </ThemedText>
        <ThemedText style={[styles.status, styles[`status_${status}`]]}>
          {status}
        </ThemedText>
      </ThemedView>

      {speed && <ThemedText style={styles.stat}>Speed: {speed}</ThemedText>}
      {eta && <ThemedText style={styles.stat}>ETA: {eta}</ThemedText>}
      {error && <ThemedText style={styles.error}>{error}</ThemedText>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
  },
  fileName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
    color: "#333",
  },
  progressContainer: {
    marginBottom: 12,
    overflow: "hidden",
  },
  progressBar: {
    height: 4,
  },
  progressBarAndroid: {
    height: 4,
    backgroundColor: "#007AFF",
    borderRadius: 2,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progress: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  status: {
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  status_idle: {
    backgroundColor: "#e0e0e0",
    color: "#666",
  },
  status_aborted: {
    backgroundColor: "#ffebee",
    color: "#d32f2f",
  },
  status_uploading: {
    backgroundColor: "#e3f2fd",
    color: "#1976d2",
  },
  status_success: {
    backgroundColor: "#e8f5e9",
    color: "#388e3c",
  },
  status_error: {
    backgroundColor: "#ffebee",
    color: "#d32f2f",
  },
  status_processing: {
    backgroundColor: "#e3f2fd",
    color: "#1976d2",
  },
  stat: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  error: {
    fontSize: 12,
    color: "#d32f2f",
    marginTop: 8,
  },
});
