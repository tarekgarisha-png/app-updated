import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { router, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ShiftLockScreen } from "@/components/ShiftLockScreen";
import { InventoryProvider } from "@/contexts/InventoryContext";
import { ShiftProvider, useShift } from "@/contexts/ShiftContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function isIncomingFileUrl(url: string): boolean {
  return (
    url.startsWith("file://") ||
    url.startsWith("content://") ||
    (url.includes(".csv") && !url.startsWith("inventory-scanner://"))
  );
}

function RootLayoutNav() {
  useEffect(() => {
    const handleUrl = (url: string) => {
      if (isIncomingFileUrl(url)) {
        router.push({
          pathname: "/import-csv",
          params: { sharedUri: url },
        });
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });

    const sub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="product-form"
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="import-csv"
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="bulk-add"
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
    </Stack>
  );
}

function AppContent() {
  const { isLocked } = useShift();
  if (isLocked) return <ShiftLockScreen />;
  return <RootLayoutNav />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <InventoryProvider>
                <ShiftProvider>
                  <AppContent />
                </ShiftProvider>
              </InventoryProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
