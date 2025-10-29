import { Ionicons } from "@expo/vector-icons";
import type { UploadFile } from "@uploadista/core/types";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { ThemedText } from "../themed-text";
import { ThemedView } from "../themed-view";
import Button from "./Button";

interface FilePreviewProps {
  visible: boolean;
  file: UploadFile | null;
  onClose: () => void;
}

export default function FilePreview({
  visible,
  file,
  onClose,
}: FilePreviewProps) {
  const mimeType = file?.metadata?.type as string | undefined;

  const [imageError, setImageError] = useState(false);

  const player = useVideoPlayer(file?.url ?? "", (player) => {
    player.loop = true;
    player.play();
  });

  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });

  if (!file) return null;

  const isImage = mimeType?.startsWith("image/");
  const isVideo = mimeType?.startsWith("video/");
  const canPreview = isImage || isVideo;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDownload = async () => {
    if (!file.url) {
      Alert.alert("Error", "File URL not available");
      return;
    }

    try {
      const supported = await Linking.canOpenURL(file.url);
      if (supported) {
        await Linking.openURL(file.url);
      } else {
        Alert.alert("Error", "Cannot open this file");
      }
    } catch (error) {
      Alert.alert("Error", `Failed to open file: ${error}`);
    }
  };

  const getFileIcon = () => {
    if (isImage) return "image";
    if (isVideo) return "videocam";
    if (mimeType?.includes("pdf")) return "document-text";
    if (mimeType?.includes("zip") || mimeType?.includes("compressed"))
      return "archive";
    return "document";
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerInfo}>
              <Ionicons
                name={getFileIcon()}
                size={24}
                color="#007AFF"
                style={styles.headerIcon}
              />
              <View style={styles.headerText}>
                <ThemedText style={styles.fileName} numberOfLines={1}>
                  {file.metadata?.fileName || "Uploaded File"}
                </ThemedText>
                <ThemedText style={styles.fileSize}>
                  {formatFileSize(file.size)} • {mimeType || "Unknown type"}
                </ThemedText>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
          >
            {isImage && !imageError && file.url ? (
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: file.url }}
                  style={styles.image}
                  resizeMode="contain"
                  onError={() => setImageError(true)}
                />
              </View>
            ) : isVideo && file.url ? (
              <View style={styles.videoContainer}>
                <VideoView
                  style={styles.video}
                  player={player}
                  allowsFullscreen
                  allowsPictureInPicture
                />
                <View style={styles.controlsContainer}>
                  <Button
                    title={isPlaying ? "Pause" : "Play"}
                    onPress={() => {
                      if (isPlaying) {
                        player.pause();
                      } else {
                        player.play();
                      }
                    }}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.noPreviewContainer}>
                <Ionicons
                  name={getFileIcon()}
                  size={64}
                  color="#ccc"
                  style={styles.noPreviewIcon}
                />
                <ThemedText style={styles.noPreviewText}>
                  {imageError
                    ? "Failed to load preview"
                    : "Preview not available for this file type"}
                </ThemedText>
              </View>
            )}

            {/* File Details */}
            <ThemedView style={styles.detailsSection}>
              <ThemedText style={styles.detailsTitle}>File Details</ThemedText>

              {file.id && (
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailLabel}>ID:</ThemedText>
                  <ThemedText style={styles.detailValue} numberOfLines={1}>
                    {file.id}
                  </ThemedText>
                </View>
              )}

              {file.url && (
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailLabel}>URL:</ThemedText>
                  <ThemedText
                    style={[styles.detailValue, styles.linkText]}
                    numberOfLines={1}
                    onPress={handleDownload}
                  >
                    {file.url}
                  </ThemedText>
                </View>
              )}

              {file.creationDate && (
                <View style={styles.detailRow}>
                  <ThemedText style={styles.detailLabel}>Uploaded:</ThemedText>
                  <ThemedText style={styles.detailValue}>
                    {new Date(file.creationDate).toLocaleString()}
                  </ThemedText>
                </View>
              )}
            </ThemedView>
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            {file.url && (
              <Button
                title={canPreview ? "Open in Browser" : "Download / Open File"}
                onPress={handleDownload}
                icon={
                  <Ionicons name="download-outline" size={20} color="#fff" />
                }
                style={styles.actionButton}
              />
            )}
            <Button
              title="Close"
              onPress={onClose}
              variant="secondary"
              style={styles.actionButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "90%",
    maxHeight: "85%",
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  headerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 16,
  },
  headerIcon: {
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 2,
  },
  fileSize: {
    fontSize: 12,
    color: "#666",
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  imageContainer: {
    width: "100%",
    minHeight: 300,
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  },
  image: {
    width: "100%",
    height: 400,
  },
  videoContainer: {
    width: "100%",
    height: 300,
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  },
  video: {
    width: "100%",
    height: "100%",
  },
  noPreviewContainer: {
    width: "100%",
    minHeight: 250,
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    padding: 32,
  },
  noPreviewIcon: {
    marginBottom: 16,
  },
  noPreviewText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },
  detailsSection: {
    backgroundColor: "#f9f9f9",
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  detailsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    width: 80,
  },
  detailValue: {
    fontSize: 13,
    color: "#1a1a1a",
    flex: 1,
  },
  linkText: {
    color: "#007AFF",
    textDecorationLine: "underline",
  },
  actions: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    gap: 8,
  },
  actionButton: {
    marginTop: 0,
  },
  controlsContainer: {
    padding: 10,
  },
});
