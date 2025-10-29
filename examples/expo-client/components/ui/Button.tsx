import {
  ActivityIndicator,
  StyleSheet,
  type TextStyle,
  TouchableOpacity,
  type ViewStyle,
} from "react-native";
import { ThemedText } from "../themed-text";

interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export default function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
  style,
  textStyle,
}: ButtonProps) {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        styles[`button_${variant}`],
        disabled && styles.buttonDisabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "secondary" ? "#007AFF" : "#fff"}
        />
      ) : (
        <ThemedText style={[styles.text, styles[`text_${variant}`], textStyle]}>
          {title}
        </ThemedText>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  button_primary: {
    backgroundColor: "#5AEAED",
  },
  button_secondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#0043FD",
  },
  button_danger: {
    backgroundColor: "#d32f2f",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  text: {
    fontSize: 16,
    fontWeight: "600",
  },
  text_primary: {
    color: "#000",
  },
  text_secondary: {
    color: "#0043FD",
  },
  text_danger: {
    color: "#fff",
  },
});
