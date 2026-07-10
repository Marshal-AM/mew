import { useCallback, useEffect, useState } from "react";
import { Alert, Text, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Button } from "@/components/Button";
import Card from "@/components/Card";
import Input from "@/components/Input";
import ScreenContainer from "@/components/ScreenContainer";
import { useWallet } from "@/context/WalletProvider";
import { SIGN_TEST_MESSAGE } from "@/wallet/walletService";
import { CHAIN, PAYMENT_FORWARDER } from "@/chain/config";
import {
  getPayoutAddress,
  getRegistryMeta,
  listPosRegistry,
  setPayoutAddress,
} from "@/cache/posRegistry";
import {
  getCustomerScreeningRecord,
  registerCustomerKyc,
  isScreeningConfigured,
  type CustomerScreeningRecord,
} from "@/lib/screening";
import { screeningNameKey, screeningStatusKey } from "@/lib/screeningStorage";
import { colors, spacing, radii, typography } from "@/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const {
    address,
    signTestMessage,
    logout,
    syncPosRegistry,
    posRegistrySyncError,
    approvalStatus,
  } = useWallet();

  const [signing, setSigning] = useState(false);
  const [signResult, setSignResult] = useState<{
    signature: string;
    valid: boolean;
  } | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const [posId, setPosId] = useState("POS-001");
  const [payoutAddress, setPayoutAddressInput] = useState("");
  const [registryStatus, setRegistryStatus] = useState<string | null>(null);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryMeta, setRegistryMeta] = useState<{
    lastSyncedAt: string | null;
    deviceCount: number;
  } | null>(null);

  const [screeningRecord, setScreeningRecord] = useState<CustomerScreeningRecord | null>(null);
  const [screeningName, setScreeningName] = useState("");
  const [screeningDocRef, setScreeningDocRef] = useState("");
  const [screeningLoading, setScreeningLoading] = useState(false);
  const [screeningStatusText, setScreeningStatusText] = useState<string | null>(null);

  const refreshScreening = useCallback(async () => {
    if (!address || !isScreeningConfigured()) {
      setScreeningRecord(null);
      setScreeningStatusText(null);
      return;
    }
    try {
      const [record, savedName] = await Promise.all([
        getCustomerScreeningRecord(address),
        AsyncStorage.getItem(screeningNameKey(address)),
      ]);
      setScreeningRecord(record);
      if (!screeningName && savedName) {
        setScreeningName(savedName);
      }
      const message = record
        ? `Backend status: ${record.screening_status}${record.full_name ? ` for ${record.full_name}` : ""}`
        : "Backend status: no screening record for this wallet yet.";
      setScreeningStatusText(message);
    } catch (err) {
      setScreeningStatusText(
        err instanceof Error ? err.message : "Failed to load KYC status"
      );
    }
  }, [address, screeningName]);

  useEffect(() => {
    void (async () => {
      const registry = await listPosRegistry();
      const saved = registry["POS-001"];
      if (saved) setPayoutAddressInput(saved);
      setRegistryMeta(await getRegistryMeta());
    })();
  }, []);

  useEffect(() => {
    void refreshScreening();
  }, [refreshScreening]);

  const handleSignTest = async () => {
    setSigning(true);
    setSignError(null);
    setSignResult(null);
    try {
      setSignResult(await signTestMessage());
    } catch (err) {
      setSignError(err instanceof Error ? err.message : "Signing failed");
    } finally {
      setSigning(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/onboarding");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <ScreenContainer scroll padBottom={false} contentStyle={styles.content}>
      <Card title="Wallet screening">
        <Text style={styles.body}>
          Live backend status for the active wallet. Re-run screening here if onboarding
          did not persist correctly.
        </Text>
        <Text style={styles.mono}>Wallet: {address ?? "No wallet loaded"}</Text>
        {screeningRecord ? (
          <>
            <Text style={styles.mono}>
              Backend name: {screeningRecord.full_name ?? "missing"}
            </Text>
            <Text style={styles.mono}>
              Backend status: {screeningRecord.screening_status}
            </Text>
            <Text style={styles.mono}>
              Screened at: {screeningRecord.screened_at ?? "not yet"}
            </Text>
          </>
        ) : null}
        {screeningStatusText ? (
          <Text style={styles.body}>{screeningStatusText}</Text>
        ) : null}
        <Input
          label="Full legal name"
          value={screeningName}
          onChangeText={setScreeningName}
          placeholder="Jane Doe"
        />
        <Input
          label="ID reference (optional)"
          value={screeningDocRef}
          onChangeText={setScreeningDocRef}
          placeholder="Passport / Emirates ID"
        />
        <View style={styles.row}>
          <Button
            title={screeningLoading ? "Submitting..." : "Run screening"}
            disabled={!address || screeningLoading || screeningName.trim().length < 2}
            onPress={async () => {
              if (!address) return;
              setScreeningLoading(true);
              setScreeningStatusText(null);
              try {
                const result = await registerCustomerKyc(
                  address,
                  screeningName.trim(),
                  screeningDocRef.trim() || undefined
                );
                await AsyncStorage.multiSet([
                  [screeningStatusKey(address), result.screening_status],
                  [screeningNameKey(address), screeningName.trim()],
                ]);
                const record = await getCustomerScreeningRecord(address);
                setScreeningRecord(record);
                if (!record?.full_name || record.screening_status !== "cleared") {
                  throw new Error(
                    "Screening response returned, but backend did not persist a cleared status."
                  );
                }
                setScreeningStatusText(
                  `Backend status: ${record.screening_status} for ${record.full_name}`
                );
                Alert.alert(
                  "Wallet screening successful",
                  `Wallet ${address} is whitelisted for transactions.`
                );
              } catch (err) {
                setScreeningStatusText(
                  err instanceof Error ? err.message : "KYC screening failed"
                );
              } finally {
                setScreeningLoading(false);
              }
            }}
          />
          <Button
            title="Refresh status"
            variant="secondary"
            onPress={() => void refreshScreening()}
          />
        </View>
      </Card>

      <Card title="POS payout mapping">
        <Text style={styles.body}>
          Preferred path: payout address in the POS QR. This registry is a legacy fallback.
        </Text>
        <Text style={styles.mono}>
          Cached devices: {registryMeta?.deviceCount ?? 0}
        </Text>
        <Text style={styles.mono}>
          Last synced: {registryMeta?.lastSyncedAt ?? "never"}
        </Text>
        {posRegistrySyncError ? (
          <Text style={styles.warning}>{posRegistrySyncError}</Text>
        ) : null}
        <Button
          title={registryLoading ? "Syncing..." : "Sync legacy registry"}
          disabled={registryLoading}
          onPress={async () => {
            setRegistryLoading(true);
            setRegistryStatus(null);
            try {
              await syncPosRegistry();
              const meta = await getRegistryMeta();
              setRegistryMeta(meta);
              setRegistryStatus(`Synced ${meta.deviceCount} device(s).`);
            } catch (err) {
              setRegistryStatus(err instanceof Error ? err.message : "Sync failed");
            } finally {
              setRegistryLoading(false);
            }
          }}
        />
        {registryStatus ? <Text style={styles.body}>{registryStatus}</Text> : null}
        <Input label="posId" value={posId} onChangeText={setPosId} autoCapitalize="characters" />
        <Input
          label="Payout address"
          value={payoutAddress}
          onChangeText={setPayoutAddressInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button
          title={registryLoading ? "Saving..." : "Save payout mapping"}
          disabled={
            registryLoading || posId.trim().length === 0 || payoutAddress.trim().length === 0
          }
          onPress={async () => {
            setRegistryLoading(true);
            setRegistryStatus(null);
            try {
              await setPayoutAddress(posId.trim(), payoutAddress.trim());
              const saved = await getPayoutAddress(posId.trim());
              setPayoutAddressInput(saved);
              setRegistryStatus(`Saved ${posId.trim()} → ${saved}`);
            } catch (err) {
              setRegistryStatus(
                err instanceof Error ? err.message : "Failed to save mapping"
              );
            } finally {
              setRegistryLoading(false);
            }
          }}
        />
      </Card>

      <Card title="Network">
        <View style={styles.listRow}>
          <Text style={styles.listLabel}>Chain ID</Text>
          <Text style={styles.listValue}>{CHAIN.chainId}</Text>
        </View>
        <View style={styles.divider} />
        <Text style={styles.listLabel}>Payment Forwarder</Text>
        <Text style={styles.mono}>{PAYMENT_FORWARDER}</Text>
        {approvalStatus ? <Text style={styles.body}>{approvalStatus}</Text> : null}
      </Card>

      <Card title="Signing test" subtitle={`Signs "${SIGN_TEST_MESSAGE}" and verifies on-device`}>
        <Button title="Run Sign Test" onPress={handleSignTest} loading={signing} />
        {signError ? <Text style={styles.error}>{signError}</Text> : null}
        {signResult ? (
          <View style={styles.resultBox}>
            <Text
              style={[
                styles.resultStatus,
                { color: signResult.valid ? colors.success : colors.error },
              ]}
            >
              {signResult.valid ? "Signature valid" : "Signature invalid"}
            </Text>
            <Text style={styles.mono} selectable>
              {signResult.signature}
            </Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <Button
          title="Log Out"
          variant="danger"
          onPress={handleLogout}
          loading={loggingOut}
        />
        <Text style={styles.logoutHint}>
          Removes the recovery phrase from secure storage on this device.
        </Text>
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingTop: spacing.md,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  warning: {
    ...typography.body,
    color: colors.warning,
    marginBottom: spacing.sm,
  },
  error: {
    ...typography.body,
    color: colors.error,
    marginTop: spacing.sm,
  },
  mono: {
    ...typography.caption,
    color: colors.textMuted,
    fontFamily: "monospace",
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  row: {
    gap: spacing.sm,
  },
  listRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  listLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  listValue: {
    ...typography.body,
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
  },
  resultBox: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  resultStatus: {
    ...typography.h3,
  },
  logoutHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
