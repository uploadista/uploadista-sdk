import {
  useFlowUpload,
  useUploadistaContext,
} from "@uploadista/react-native-core";
import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "../../components/ui/Button";
import ProgressCard from "../../components/ui/ProgressCard";
import { FLOW_CONFIG } from "../../utils/config";
import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";

export default function FlowUploadScreen() {
  const [flowId, setFlowId] = useState(FLOW_CONFIG.flowId);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const { fileSystemProvider } = useUploadistaContext();

  const { upload, state, abort } = useFlowUpload({
    flowId,
    storageId: "local",
  });

  const handleStartFlow = async () => {
    if (!flowId) {
      Alert.alert("Error", "Please enter a flow ID");
      return;
    }
    if (!fileSystemProvider) {
      Alert.alert("Error", "File system provider not available");
      return;
    }
    try {
      // Pick a file first, then upload through flow
      const file = await fileSystemProvider.pickDocument?.();
      if (file) {
        await upload?.(file);
      }
    } catch (error) {
      Alert.alert("Error", `Flow upload failed: ${error}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
      >
        <ThemedText style={styles.title}>Flow Upload</ThemedText>

        {/* Configuration Section */}
        <ThemedView variant="section">
          <ThemedText type="sectionTitle">Configuration</ThemedText>
          <Button
            title={isConfigOpen ? "Hide Config" : "Show Config"}
            onPress={() => setIsConfigOpen(!isConfigOpen)}
            variant="secondary"
            style={styles.button}
          />
        </ThemedView>

        {isConfigOpen && (
          <ThemedView variant="section">
            <ThemedText type="label">Flow ID</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="Enter flow ID"
              value={flowId}
              onChangeText={setFlowId}
              editable={state.status === "idle"}
            />
            <ThemedText type="helperText">
              The flow ID identifies which processing pipeline to use on the
              server.
            </ThemedText>
          </ThemedView>
        )}

        {/* Flow Status Section */}
        {state.status !== "idle" && (
          <ThemedView variant="section">
            <ThemedText type="sectionTitle">Flow Status</ThemedText>
            <ThemedView variant="card">
              <ThemedText style={styles.statusLabel}>Flow ID:</ThemedText>
              <ThemedText style={styles.statusValue}>{flowId}</ThemedText>
            </ThemedView>
            {state.jobId && (
              <ThemedView variant="card">
                <ThemedText style={styles.statusLabel}>Job ID:</ThemedText>
                <ThemedText style={styles.statusValue}>{state.jobId}</ThemedText>
              </ThemedView>
            )}
            <ProgressCard
              fileName="Flow Upload"
              progress={state.progress}
              status={state.status}
              error={state.error?.message}
            />
          </ThemedView>
        )}

        {/* Control Buttons */}
        <ThemedView variant="section">
          <Button
            title={
              state.status === "uploading"
                ? "Cancel Flow"
                : state.status === "success"
                  ? "Start New Flow"
                  : "Start Flow Upload"
            }
            onPress={
              state.status === "uploading" ? () => abort?.() : handleStartFlow
            }
            loading={state.status === "uploading"}
            style={styles.button}
          />
        </ThemedView>

        {/* Results Section */}
        {state.status === "success" && (
          <ThemedView variant="successBox" style={styles.successBox}>
            <ThemedText type="successText" style={styles.successTitle}>
              ✓ Flow Completed Successfully!
            </ThemedText>
            {typeof state.result === "string" && (
              <ThemedView style={styles.resultContainer}>
                <ThemedText style={styles.resultLabel}>Results:</ThemedText>
                <ThemedText style={styles.resultText}>
                  {JSON.stringify(state.result, null, 2)}
                </ThemedText>
              </ThemedView>
            )}
          </ThemedView>
        )}

        {state.error && (
          <ThemedView variant="errorBox" style={styles.errorBox}>
            <ThemedText type="errorText" style={styles.errorTitle}>✗ Flow Error</ThemedText>
            <ThemedText type="errorText">{state.error.message}</ThemedText>
          </ThemedView>
        )}

        {/* Info Section */}
        <ThemedView variant="infoSection">
          <ThemedText style={styles.infoTitle}>About Flow Upload</ThemedText>
          <ThemedText type="infoText">
            Flow upload allows you to submit files through orchestrated
            processing pipelines. Flows can apply transformations like image
            resizing, format conversion, or custom processing before storing
            files.
          </ThemedText>
          <ThemedText type="infoText" style={{ marginTop: 8 }}>
            Flows use WebSocket connections for real-time progress updates and
            are perfect for complex, multi-step upload scenarios.
          </ThemedText>
          <ThemedText style={styles.infoNote}>
            Note: This requires a configured flow on your server. Contact your
            administrator for available flow IDs.
          </ThemedText>
        </ThemedView>
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
  },
  button: {
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8,
    backgroundColor: "#f9f9f9",
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  statusValue: {
    fontSize: 14,
    marginTop: 4,
    fontFamily: "Courier New",
  },
  successBox: {
    marginBottom: 16,
  },
  successTitle: {
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 12,
  },
  resultContainer: {
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 4,
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  resultText: {
    fontSize: 11,
    fontFamily: "Courier New",
  },
  errorBox: {
    marginBottom: 16,
  },
  errorTitle: {
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  infoNote: {
    fontSize: 11,
    color: "#bbb",
    fontStyle: "italic",
    marginTop: 12,
  },
});
