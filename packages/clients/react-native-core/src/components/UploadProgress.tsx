import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { UploadState } from "../hooks/use-upload";
import { formatFileSize } from "../utils";

export interface UploadProgressProps {
  /**  Upload state information */
  state: UploadState;
  /** Optional custom label */
  label?: string;
}

/**
 * Component to display upload progress with percentage, size, and speed
 */
export function UploadProgress({ state, label }: UploadProgressProps) {
  const getStatusColor = () => {
    switch (state.status) {
      case "uploading":
        return "#007AFF";
      case "success":
        return "#34C759";
      case "error":
      case "aborted":
        return "#FF3B30";
      default:
        return "#999999";
    }
  };

  const renderContent = () => {
    switch (state.status) {
      case "idle":
        return (
          <View style={styles.container}>
            <Text style={styles.label}>{label || "Ready to upload"}</Text>
          </View>
        );

      case "uploading":
        return (
          <View style={styles.container}>
            <View style={styles.headerRow}>
              <Text style={styles.label}>{label || "Uploading"}</Text>
              <Text style={styles.percentage}>{state.progress}%</Text>
            </View>

            {/* Progress bar */}
            <View style={styles.progressBarContainer}>
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${state.progress}%`,
                    backgroundColor: getStatusColor(),
                  },
                ]}
              />
            </View>

            {/* Details row */}
            <View style={styles.detailsRow}>
              <Text style={styles.detail}>
                {formatFileSize(state.bytesUploaded)} /{" "}
                {formatFileSize(state.totalBytes || 0)}
              </Text>
            </View>
          </View>
        );

      case "success":
        return (
          <View style={styles.container}>
            <View style={styles.headerRow}>
              <Text style={[styles.label, { color: getStatusColor() }]}>
                {label || "Upload complete"}
              </Text>
              <Text style={[styles.percentage, { color: getStatusColor() }]}>
                ✓
              </Text>
            </View>
            <Text style={[styles.detail, { color: getStatusColor() }]}>
              {formatFileSize(state.totalBytes || 0)}
            </Text>
          </View>
        );

      case "error":
        return (
          <View style={styles.container}>
            <View style={styles.headerRow}>
              <Text style={[styles.label, { color: getStatusColor() }]}>
                {label || "Upload failed"}
              </Text>
              <Text style={[styles.percentage, { color: getStatusColor() }]}>
                ✕
              </Text>
            </View>
            {state.error && (
              <Text style={[styles.detail, { color: getStatusColor() }]}>
                {state.error.message}
              </Text>
            )}
          </View>
        );

      case "aborted":
        return (
          <View style={styles.container}>
            <Text style={[styles.label, { color: getStatusColor() }]}>
              {label || "Upload cancelled"}
            </Text>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View
      style={[
        styles.wrapper,
        {
          borderLeftColor: getStatusColor(),
        },
      ]}
    >
      {state.status === "uploading" && (
        <ActivityIndicator
          size="small"
          color={getStatusColor()}
          style={styles.spinner}
        />
      )}
      {renderContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderLeftWidth: 4,
    backgroundColor: "#f5f5f5",
    borderRadius: 4,
    gap: 8,
  },
  spinner: {
    marginTop: 4,
  },
  container: {
    flex: 1,
    gap: 4,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333333",
    flex: 1,
  },
  percentage: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
    minWidth: 36,
    textAlign: "right",
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: "#e0e0e0",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 2,
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detail: {
    fontSize: 12,
    color: "#666666",
  },
});
