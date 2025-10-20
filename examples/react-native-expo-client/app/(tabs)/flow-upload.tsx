import {
  useFlowUpload,
  useUploadistaContext,
} from "@uploadista/react-native-core";
import { useState } from "react";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Button from "../../components/ui/Button";
import ProgressCard from "../../components/ui/ProgressCard";
import { FLOW_CONFIG } from "../../utils/config";

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
        <Text style={styles.title}>Flow Upload</Text>

        {/* Configuration Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuration</Text>
          <Button
            title={isConfigOpen ? "Hide Config" : "Show Config"}
            onPress={() => setIsConfigOpen(!isConfigOpen)}
            variant="secondary"
            style={styles.button}
          />
        </View>

        {isConfigOpen && (
          <View style={styles.section}>
            <Text style={styles.label}>Flow ID</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter flow ID"
              value={flowId}
              onChangeText={setFlowId}
              editable={state.status === "idle"}
            />
            <Text style={styles.helperText}>
              The flow ID identifies which processing pipeline to use on the
              server.
            </Text>
          </View>
        )}

        {/* Flow Status Section */}
        {state.status !== "idle" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Flow Status</Text>
            <View style={styles.statusBox}>
              <Text style={styles.statusLabel}>Flow ID:</Text>
              <Text style={styles.statusValue}>{flowId}</Text>
            </View>
            {state.jobId && (
              <View style={styles.statusBox}>
                <Text style={styles.statusLabel}>Job ID:</Text>
                <Text style={styles.statusValue}>{state.jobId}</Text>
              </View>
            )}
            <ProgressCard
              fileName="Flow Upload"
              progress={state.progress}
              status={state.status}
              error={state.error?.message}
            />
          </View>
        )}

        {/* Control Buttons */}
        <View style={styles.section}>
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
        </View>

        {/* Results Section */}
        {state.status === "success" && (
          <View style={styles.successBox}>
            <Text style={styles.successTitle}>
              ✓ Flow Completed Successfully!
            </Text>
            {typeof state.result === "string" && (
              <View style={styles.resultContainer}>
                <Text style={styles.resultLabel}>Results:</Text>
                <Text style={styles.resultText}>
                  {JSON.stringify(state.result, null, 2)}
                </Text>
              </View>
            )}
          </View>
        )}

        {state.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>✗ Flow Error</Text>
            <Text style={styles.errorText}>{state.error.message}</Text>
          </View>
        )}

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>About Flow Upload</Text>
          <Text style={styles.infoText}>
            Flow upload allows you to submit files through orchestrated
            processing pipelines. Flows can apply transformations like image
            resizing, format conversion, or custom processing before storing
            files.
          </Text>
          <Text style={[styles.infoText, { marginTop: 8 }]}>
            Flows use WebSocket connections for real-time progress updates and
            are perfect for complex, multi-step upload scenarios.
          </Text>
          <Text style={styles.infoNote}>
            Note: This requires a configured flow on your server. Contact your
            administrator for available flow IDs.
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
  button: {
    marginTop: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
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
  helperText: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
  },
  statusBox: {
    padding: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
  },
  statusValue: {
    fontSize: 14,
    color: "#333",
    marginTop: 4,
    fontFamily: "Courier New",
  },
  successBox: {
    padding: 16,
    backgroundColor: "#e8f5e9",
    borderLeftWidth: 4,
    borderLeftColor: "#4caf50",
    borderRadius: 4,
    marginBottom: 16,
  },
  successTitle: {
    color: "#2e7d32",
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
    color: "#2e7d32",
    marginBottom: 4,
  },
  resultText: {
    fontSize: 11,
    color: "#2e7d32",
    fontFamily: "Courier New",
  },
  errorBox: {
    padding: 16,
    backgroundColor: "#ffebee",
    borderLeftWidth: 4,
    borderLeftColor: "#d32f2f",
    borderRadius: 4,
    marginBottom: 16,
  },
  errorTitle: {
    color: "#c62828",
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 8,
  },
  errorText: {
    color: "#c62828",
    fontSize: 13,
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
  infoNote: {
    fontSize: 11,
    color: "#bbb",
    fontStyle: "italic",
    marginTop: 12,
  },
});
