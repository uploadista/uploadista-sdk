import { LinearProgress } from "@rneui/themed";
import type { UploadStatus } from "@uploadista/react-native-core";
import { StyleSheet, TouchableOpacity } from "react-native";
import { ThemedText } from "../themed-text";
import { ThemedView } from "../themed-view";
import { Ionicons } from "@expo/vector-icons";

interface ProgressCardProps {
  fileName?: string;
  progress?: number;
  status?: UploadStatus | "processing";
  speed?: string;
  eta?: string;
  error?: string;
  fileSize?: number;
  onRemove?: () => void;
  onPreview?: () => void;
}

export default function ProgressCard({
  fileName,
  progress = 0,
  status = "idle",
  speed,
  eta,
  error,
  fileSize,
  onRemove,
  onPreview,
}: ProgressCardProps) {
  const progressValue = Math.max(0, Math.min(1, (progress || 0) / 100));

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusIcon = () => {
    switch (status) {
      case "success":
        return <Ionicons name="checkmark-circle" size={20} color="#388e3c" />;
      case "error":
      case "aborted":
        return <Ionicons name="close-circle" size={20} color="#d32f2f" />;
      case "uploading":
        return <Ionicons name="cloud-upload" size={20} color="#1976d2" />;
      default:
        return <Ionicons name="time" size={20} color="#666" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "success":
        return "#388e3c";
      case "error":
      case "aborted":
        return "#d32f2f";
      case "uploading":
        return "#1976d2";
      default:
        return "#999";
    }
  };

  return (
    <ThemedView style={[styles.card, { borderLeftColor: getStatusColor() }]}>
      <ThemedView style={styles.header}>
        <ThemedView style={styles.fileInfo}>
          <ThemedView style={styles.iconContainer}>{getStatusIcon()}</ThemedView>
          <ThemedView style={styles.fileDetails}>
            {fileName && (
              <ThemedText style={styles.fileName} numberOfLines={1}>
                {fileName}
              </ThemedText>
            )}
            {fileSize && (
              <ThemedText style={styles.fileSize}>
                {formatFileSize(fileSize)}
              </ThemedText>
            )}
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.headerActions}>
          {onPreview && status === "success" && (
            <TouchableOpacity
              onPress={onPreview}
              style={styles.previewButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="eye-outline" size={22} color="#007AFF" />
            </TouchableOpacity>
          )}
          {onRemove && (
            <TouchableOpacity
              onPress={onRemove}
              style={styles.removeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color="#666" />
            </TouchableOpacity>
          )}
        </ThemedView>
      </ThemedView>

      <ThemedView style={styles.progressSection}>
        <ThemedView style={styles.progressInfo}>
          <ThemedText style={styles.progress}>
            {Math.round(progress || 0)}%
          </ThemedText>
          {(speed || eta) && (
            <ThemedText style={styles.stat}>
              {speed && `${speed}`}
              {speed && eta && " • "}
              {eta && `${eta}`}
            </ThemedText>
          )}
        </ThemedView>

        <LinearProgress
          value={progressValue}
          style={styles.progressBar}
          variant="determinate"
          color={getStatusColor()}
        />
      </ThemedView>

      {error && (
        <ThemedView style={styles.errorContainer}>
          <Ionicons
            name="alert-circle"
            size={16}
            color="#d32f2f"
            style={styles.errorIcon}
          />
          <ThemedText style={styles.error}>{error}</ThemedText>
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  fileInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  iconContainer: {
    marginRight: 12,
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 2,
  },
  fileSize: {
    fontSize: 13,
    color: "#666",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  previewButton: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: "#e3f2fd",
  },
  removeButton: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
  },
  progressSection: {
    gap: 8,
  },
  progressInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progress: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333",
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
  },
  stat: {
    fontSize: 12,
    color: "#999",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    padding: 12,
    backgroundColor: "#ffebee",
    borderRadius: 8,
  },
  errorIcon: {
    marginRight: 8,
  },
  error: {
    fontSize: 13,
    color: "#d32f2f",
    flex: 1,
  },
});
