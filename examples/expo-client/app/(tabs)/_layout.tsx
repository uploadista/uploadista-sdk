import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import React from "react";
import { HapticTab } from "@/components/haptic-tab";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <Ionicons size={28} name="cloud-upload-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="gallery-upload"
        options={{
          title: "Gallery Upload",
          tabBarIcon: ({ color }) => (
            <Ionicons size={28} name="images-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="flow-upload"
        options={{
          title: "Flow Upload",
          tabBarIcon: ({ color }) => (
            <Ionicons size={28} name="flower-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="multi-upload"
        options={{
          title: "Multi Upload",
          tabBarIcon: ({ color }) => (
            <Ionicons size={28} name="list-outline" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
