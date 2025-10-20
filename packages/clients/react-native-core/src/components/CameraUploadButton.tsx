import { type ReactNode, useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useCameraUpload } from "../hooks";
import type { UseCameraUploadOptions } from "../types";
import { UploadProgress } from "./UploadProgress";

export interface CameraUploadButtonProps {
  /** Options for camera upload */
  options?: UseCameraUploadOptions;
  /** Button label text */
  label?: string;
  /** Custom button content */
  children?: ReactNode;
  /** Callback when upload completes successfully */
  onSuccess?: (result: unknown) => void;
  /** Callback when upload fails */
  onError?: (error: Error) => void;
  /** Callback when upload is cancelled */
  onCancel?: () => void;
  /** Whether to show progress inline */
  showProgress?: boolean;
}

/**
 * Button component for camera capture and upload
 * Triggers camera on press and handles upload with progress display
 */
export function CameraUploadButton({
  options,
  label = "Take Photo",
  children,
  onSuccess,
  onError,
  onCancel,
  showProgress = true,
}: CameraUploadButtonProps) {
  const { state, captureAndUpload } = useCameraUpload(options);

  const handlePress = async () => {
    try {
      await captureAndUpload();
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

  const isLoading = state.status === "uploading";
  const isDisabled = isLoading || state.status === "aborted";

  useEffect(() => {
    if (state.status === "success" && state.result) {
      onSuccess?.(state.result);
    }
  }, [state.status, state.result, onSuccess]);

  useEffect(() => {
    if (state.status === "error" && state.error) {
      onError?.(state.error);
    }
  }, [state.status, state.error, onError]);

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.button, isDisabled && styles.buttonDisabled]}
        onPress={handlePress}
        disabled={isDisabled}
      >
        {isLoading && (
          <ActivityIndicator
            size="small"
            color="#FFFFFF"
            style={styles.spinner}
          />
        )}
        <Text style={styles.buttonText}>{children || label}</Text>
      </Pressable>
      {showProgress && state.status !== "idle" && (
        <View style={styles.progressContainer}>
          <UploadProgress state={state} label="Camera upload" />
        </View>
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
    backgroundColor: "#007AFF",
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
  progressContainer: {
    marginTop: 4,
  },
});
