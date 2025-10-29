import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { UploadistaProvider } from "@uploadista/expo";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { API_URL } from "@/utils/config";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  console.log("=== RootLayout Initialized ===");
  console.log("UploadistaProvider baseUrl:", API_URL);
  console.log("==============================");

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <UploadistaProvider
        baseUrl={API_URL}
        storageId="local"
        chunkSize={1024 * 1024}
        storeFingerprintForResuming={true}
        onError={(error) => {
          console.error("[UploadistaProvider] ERROR:", error);
          console.error("[UploadistaProvider] Error stack:", error instanceof Error ? error.stack : "No stack");
        }}
        onEvent={(event) => {
          console.log("[UploadistaProvider] Event:", event);
        }}
      >
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style="auto" />
      </UploadistaProvider>
    </ThemeProvider>
  );
}
