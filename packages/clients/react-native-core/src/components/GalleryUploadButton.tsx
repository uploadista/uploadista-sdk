import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useGalleryUpload } from "../hooks";
import type { UseGalleryUploadOptions } from "../types";
import { UploadProgress } from "./UploadProgress";

export interface GalleryUploadButtonProps {
  /** Options for gallery upload */
  options?: UseGalleryUploadOptions;
  /** Button label text */
  label?: string;
  /** Custom button content */
  children?: ReactNode;
  /** Callback when all uploads complete successfully */
  onSuccess?: (results: unknown[]) => void;
  /** Callback when any upload fails */
  onError?: (error: Error) => void;
  /** Callback when upload is cancelled */
  onCancel?: () => void;
  /** Whether to show individual progress for each file */
  showProgress?: boolean;
}

/**
 * Button component for gallery selection and batch upload
 * Triggers gallery picker on press and handles concurrent uploads
 */
export function GalleryUploadButton({
  options,
  label = "Select from Gallery",
  children,
  onSuccess,
  onError,
  onCancel,
  showProgress = true,
}: GalleryUploadButtonProps) {
  const { state, selectAndUpload } = useGalleryUpload(options);

  const handlePress = async () => {
    try {
      await selectAndUpload();
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.message.includes("cancelled") ||
          error.message.includes("aborted")
        ) {
          onCancel?.();
        } else {
          onError?.(error);
        }
      }
    }
  };

  const isLoading = state.items.some((item) => item.status === "uploading");
  const hasItems = state.items.length > 0;
  const allComplete =
    hasItems &&
    state.items.every(
      (item) => item.status !== "uploading" && item.status !== "idle",
    );

  React.useEffect(() => {
    if (allComplete) {
      const results = state.items
        .filter((item) => item.status === "success")
        .map((item) => item.result);
      if (results.length > 0) {
        onSuccess?.(results);
      }
    }
  }, [allComplete, state.items, onSuccess]);

  React.useEffect(() => {
    const errors = state.items.filter((item) => item.status === "error");
    const firstError = errors[0]?.error;
    if (firstError) {
      onError?.(firstError);
    }
  }, [state.items, onError]);

  const renderItem = ({ item }: { item: (typeof state.items)[0] }) => (
    <View key={item.id} style={styles.itemContainer}>
      <UploadProgress
        state={{
          status: item.status,
          progress: item.progress,
          bytesUploaded: item.bytesUploaded,
          totalBytes: item.totalBytes,
          error: item.error,
          result: item.result,
        }}
        label={item.file.name}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={handlePress}
        disabled={isLoading}
      >
        {isLoading && (
          <ActivityIndicator
            size="small"
            color="#FFFFFF"
            style={styles.spinner}
          />
        )}
        <Text style={styles.buttonText}>
          {children || label}
          {hasItems && ` (${state.items.length})`}
        </Text>
      </Pressable>

      {hasItems && (
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            Progress: {state.items.filter((i) => i.status === "success").length}
            /{state.items.length} uploaded
          </Text>
          <Text style={styles.statsText}>Overall: {state.totalProgress}%</Text>
        </View>
      )}

      {showProgress && hasItems && (
        <FlatList
          scrollEnabled={false}
          data={state.items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#34C759",
    borderRadius: 8,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  spinner: {
    marginRight: 4,
  },
  statsContainer: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 4,
    gap: 4,
  },
  statsText: {
    fontSize: 12,
    color: "#666666",
  },
  listContainer: {
    maxHeight: 400,
  },
  listContent: {
    gap: 8,
  },
  itemContainer: {
    paddingHorizontal: 0,
  },
  separator: {
    height: 4,
  },
});
