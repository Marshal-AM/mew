import { useEffect } from "react";
import { ActivityIndicator, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import ScreenContainer from "@/components/ScreenContainer";
import { MOOPAY_LOGO } from "@/constants/images";
import { useWallet } from "@/context/WalletProvider";
import { colors, spacing } from "@/theme";

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
    <ScreenContainer padTop padBottom contentStyle={styles.container}>
      <Image source={MOOPAY_LOGO} style={styles.logo} resizeMode="contain" />
      <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 180,
    height: 48,
  },
  spinner: {
    marginTop: spacing.xl,
  },
});
