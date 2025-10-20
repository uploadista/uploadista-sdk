import { useGalleryUpload } from "@uploadista/react-native-core";
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

export default function GalleryUploadScreen() {
  const { selectAndUpload, removeItem, clear, state } = useGalleryUpload({
    mediaType: "photo",
    allowMultiple: true,
    onSuccess: () => {
      Alert.alert("Success", "Gallery items uploaded successfully!");
    },
    onError: (error) => {
      Alert.alert("Gallery Error", `Upload failed: ${error.message}`);
    },
  });

  const handleSelectFromGallery = async () => {
    try {
      await selectAndUpload?.();
    } catch (error) {
      Alert.alert("Gallery Error", `Failed to select: ${error}`);
    }
  };

  const handleRemoveItem = (id: string) => {
    removeItem?.(id);
  };

  const handleClearAll = () => {
    clear?.();
  };

  const items = state.items || [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.title}>Gallery Upload</Text>

        <View style={styles.section}>
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{items.length}</Text>
              <Text style={styles.statLabel}>Uploading</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {Math.round(state.totalProgress || 0)}%
              </Text>
              <Text style={styles.statLabel}>Progress</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Button
            title="Select from Gallery"
            onPress={handleSelectFromGallery}
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
                <View style={styles.itemContainer}>
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
            <Text style={styles.emptyText}>No items selected</Text>
            <Text style={styles.emptySubtext}>
              Tap "Select from Gallery" to get started
            </Text>
          </View>
        )}

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>About Gallery Upload</Text>
          <Text style={styles.infoText}>
            Gallery upload allows you to select multiple photos or videos from
            your device's library and upload them all at once. Perfect for batch
            uploads and photo backups.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  itemContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f5f5f5",
  },
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
  gridContainer: {
    justifyContent: "space-between",
    marginBottom: 12,
  },
  gridItem: {
    width: "30%",
  },
  thumbnail: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: "#f5f5f5",
    marginBottom: 8,
  },
  itemName: {
    fontSize: 10,
    color: "#666",
    marginBottom: 4,
  },
  removeButton: {
    paddingVertical: 4,
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
