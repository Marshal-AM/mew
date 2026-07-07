import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useWallet } from "@/context/WalletProvider";
import { colors } from "@/theme";

export default function Index() {
  const { state } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (state === "loading") return;
    if (state === "unlocked") {
      router.replace("/(tabs)/wallet");
    } else {
      router.replace("/onboarding");
    }
  }, [state, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
});
