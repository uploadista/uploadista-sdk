import { StyleSheet, Text, type TextProps } from "react-native";

import { useThemeColor } from "@/hooks/use-theme-color";

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?:
    | "default"
    | "title"
    | "defaultSemiBold"
    | "subtitle"
    | "link"
    | "statsValue"
    | "label"
    | "sectionTitle"
    | "infoText"
    | "errorText"
    | "successText"
    | "helperText";
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = "default",
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, "text");

  return (
    <Text
      style={[
        { color },
        type === "default" ? styles.default : undefined,
        type === "title" ? styles.title : undefined,
        type === "defaultSemiBold" ? styles.defaultSemiBold : undefined,
        type === "subtitle" ? styles.subtitle : undefined,
        type === "link" ? styles.link : undefined,
        type === "statsValue" ? styles.statsValue : undefined,
        type === "label" ? styles.label : undefined,
        type === "sectionTitle" ? styles.sectionTitle : undefined,
        type === "infoText" ? styles.infoText : undefined,
        type === "errorText" ? styles.errorText : undefined,
        type === "successText" ? styles.successText : undefined,
        type === "helperText" ? styles.helperText : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    color: "#0a7ea4",
  },
  statsValue: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#0043FD",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 12,
    textTransform: "uppercase",
  },
  infoText: {
    fontSize: 13,
    color: "#999",
    lineHeight: 20,
  },
  errorText: {
    color: "#c62828",
    fontWeight: "600",
  },
  successText: {
    color: "#2e7d32",
    fontWeight: "600",
  },
  helperText: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
  },
});
