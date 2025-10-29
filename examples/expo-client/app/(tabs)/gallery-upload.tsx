import { useGalleryUpload } from "@uploadista/react-native-core";
import { Alert, FlatList, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import Button from "@/components/ui/Button";
import ProgressCard from "@/components/ui/ProgressCard";

export default function GalleryUploadScreen() {
  console.log("[GalleryUpload] Screen mounted");

  const { selectAndUpload, removeItem, clear, state } = useGalleryUpload({
    mediaType: "photo",
    allowMultiple: true,
    onSuccess: () => {
      console.log("[GalleryUpload] Upload SUCCESS");
      Alert.alert("Success", "Gallery items uploaded successfully!");
    },
    onError: (error) => {
      console.error("[GalleryUpload] Upload ERROR:", error);
      console.error("[GalleryUpload] Error details:", {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
      Alert.alert("Gallery Error", `Upload failed: ${error.message}`);
    },
    onProgress: (progress) => {
      console.log("[GalleryUpload] Progress:", progress);
    },
  });

  console.log("[GalleryUpload] Current state:", state);

  const handleSelectFromGallery = async () => {
    console.log("[GalleryUpload] Select from gallery button pressed");
    try {
      console.log("[GalleryUpload] Calling selectAndUpload...");
      await selectAndUpload?.();
      console.log("[GalleryUpload] selectAndUpload completed");
    } catch (error) {
      console.error("[GalleryUpload] Failed to select from gallery:", error);
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
        <ThemedText style={styles.title}>Gallery Upload</ThemedText>

        <ThemedView variant="section">
          <ThemedView style={styles.statsContainer}>
            <ThemedView variant="statBox">
              <ThemedText type="statsValue">{items.length}</ThemedText>
              <ThemedText style={styles.statLabel}>Uploading</ThemedText>
            </ThemedView>
            <ThemedView variant="statBox">
              <ThemedText type="statsValue">
                {Math.round(state.totalProgress || 0)}%
              </ThemedText>
              <ThemedText style={styles.statLabel}>Progress</ThemedText>
            </ThemedView>
          </ThemedView>
        </ThemedView>

        <ThemedView variant="section">
          <Button
            title="Select from Gallery"
            onPress={handleSelectFromGallery}
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
                <ThemedView style={styles.itemContainer}>
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
                </ThemedView>
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
            <ThemedText style={styles.emptyText}>No items selected</ThemedText>
            <ThemedText type="infoText" style={styles.emptySubtext}>
              Tap "Select from Gallery" to get started
            </ThemedText>
          </ThemedView>
        )}

        <ThemedView variant="infoSection">
          <ThemedText style={styles.infoTitle}>About Gallery Upload</ThemedText>
          <ThemedText type="infoText">
            Gallery upload allows you to select multiple photos or videos from
            your device's library and upload them all at once. Perfect for batch
            uploads and photo backups.
          </ThemedText>
        </ThemedView>
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
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statLabel: {
    fontSize: 12,
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
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
  },
});
