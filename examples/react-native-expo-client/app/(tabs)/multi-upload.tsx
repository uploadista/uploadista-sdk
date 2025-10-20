import { useMultiUpload } from "@uploadista/react-native-core";
import {
  Alert,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Button from "../../components/ui/Button";
import ProgressCard from "../../components/ui/ProgressCard";

export default function MultiUploadScreen() {
  const { state, removeItem, clear } = useMultiUpload({
    onSuccess: () => {
      Alert.alert("Success", "All files uploaded successfully!");
    },
    onError: (error) => {
      Alert.alert("Error", `Upload failed: ${error.message}`);
    },
  });

  const handleAddFiles = () => {
    try {
      // In a real implementation, you would use a file picker here
      // and then call addFiles with the results
      Alert.alert("Add Files", "Implement file picker integration");
    } catch (error) {
      Alert.alert("Error", `Failed to add files: ${error}`);
    }
  };

  const handleRemoveItem = (id: string) => {
    removeItem?.(id);
  };

  const handleClearAll = () => {
    clear?.();
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
        <Text style={styles.title}>Multiple File Upload</Text>

        <View style={styles.section}>
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{items.length}</Text>
              <Text style={styles.statLabel}>Files</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{totalProgress}%</Text>
              <Text style={styles.statLabel}>Progress</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Button
            title="Add Files"
            onPress={handleAddFiles}
            variant="secondary"
            style={styles.button}
          />
        </View>

        {items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Uploads ({items.length})</Text>
            <FlatList
              scrollEnabled={false}
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.uploadItem}>
                  <ProgressCard
                    fileName={`File ${item.id.substring(0, 8)}`}
                    progress={item.progress || 0}
                    status={
                      (item.status === "aborted" ? "error" : item.status) as
                        | "idle"
                        | "uploading"
                        | "success"
                        | "error"
                        | undefined
                    }
                  />
                  <Button
                    title="Remove"
                    onPress={() => handleRemoveItem(item.id)}
                    variant="danger"
                    style={styles.removeButton}
                  />
                </View>
              )}
            />
          </View>
        )}

        {items.length > 0 && (
          <View style={styles.section}>
            <Button
              title="Clear All"
              onPress={handleClearAll}
              variant="danger"
              style={styles.button}
            />
          </View>
        )}

        {items.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No files selected</Text>
            <Text style={styles.emptySubtext}>
              Tap "Add Files" to get started
            </Text>
          </View>
        )}

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>About Multi Upload</Text>
          <Text style={styles.infoText}>
            Multi file upload allows you to select and upload multiple files
            simultaneously. Track progress for each file and the overall batch.
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
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statBox: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    alignItems: "center",
    marginHorizontal: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "700",
    color: "#007AFF",
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  button: {
    marginTop: 12,
  },
  uploadItem: {
    marginBottom: 16,
  },
  removeButton: {
    marginTop: 8,
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
    color: "#bbb",
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
