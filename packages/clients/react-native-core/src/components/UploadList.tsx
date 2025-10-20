import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { UploadItem } from "../types";
import { UploadProgress } from "./UploadProgress";

export interface UploadListProps {
  /** List of upload items to display */
  items: UploadItem[];
  /** Callback when remove item is pressed */
  onRemove?: (id: string) => void;
  /** Callback when item is pressed */
  onItemPress?: (item: UploadItem) => void;
  /** Whether to show remove button */
  showRemoveButton?: boolean;
}

/**
 * Component to display a list of upload items with individual progress
 * Shows status indicators and allows removal of items
 */
export function UploadList({
  items,
  onRemove,
  onItemPress,
  showRemoveButton = true,
}: UploadListProps) {
  const renderItem = ({ item }: { item: UploadItem }) => (
    <Pressable
      style={[
        styles.itemContainer,
        { borderLeftColor: getStatusColor(item.progress.state) },
      ]}
      onPress={() => onItemPress?.(item)}
    >
      <View style={styles.itemContent}>
        <View style={styles.itemHeader}>
          <Text style={styles.fileName} numberOfLines={1}>
            {item.file.name}
          </Text>
          <Text style={styles.fileSize}>
            {getFileSizeDisplay(item.file.size)}
          </Text>
        </View>
        <View style={styles.progressWrapper}>
          <UploadProgress
            state={{
              status:
                item.progress.state === "pending"
                  ? "idle"
                  : item.progress.state === "cancelled"
                    ? "aborted"
                    : item.progress.state,
              progress: item.progress.progress,
              bytesUploaded: item.progress.uploadedBytes,
              totalBytes: item.progress.totalBytes,
              error: item.progress.error || null,
              result: (item.result as any) || null,
            }}
          />
        </View>
      </View>
      {showRemoveButton &&
        item.progress.state !== "uploading" &&
        item.progress.state !== "pending" && (
          <Pressable
            style={styles.removeButton}
            onPress={() => onRemove?.(item.id)}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Text style={styles.removeButtonText}>✕</Text>
          </Pressable>
        )}
    </Pressable>
  );

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No uploads</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerText}>Uploads ({items.length})</Text>
        <Text style={styles.headerSubtext}>
          {items.filter((i) => i.progress.state === "success").length} complete
        </Text>
      </View>
      <FlatList
        scrollEnabled={false}
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

// Helper functions
function getStatusColor(state: string): string {
  switch (state) {
    case "success":
      return "#34C759";
    case "error":
    case "cancelled":
      return "#FF3B30";
    case "uploading":
    case "pending":
      return "#007AFF";
    default:
      return "#999999";
  }
}

function getFileSizeDisplay(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / k ** i) * 10) / 10} ${sizes[i]}`;
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f9f9f9",
    borderRadius: 4,
  },
  headerText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333333",
  },
  headerSubtext: {
    fontSize: 14,
    color: "#666666",
  },
  listContent: {
    gap: 8,
  },
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderLeftWidth: 4,
    backgroundColor: "#f5f5f5",
    borderRadius: 4,
    gap: 8,
  },
  itemContent: {
    flex: 1,
    gap: 6,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fileName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333333",
    flex: 1,
  },
  fileSize: {
    fontSize: 12,
    color: "#999999",
    marginLeft: 8,
  },
  progressWrapper: {
    marginTop: 2,
  },
  removeButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "#FFE5E5",
  },
  removeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FF3B30",
  },
  separator: {
    height: 4,
  },
  emptyContainer: {
    paddingVertical: 24,
    paddingHorizontal: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#999999",
    fontStyle: "italic",
  },
});
