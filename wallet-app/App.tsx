import "./src/crypto/setup";

import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import * as Network from "expo-network";
import { WalletProvider, useWallet } from "./src/context/WalletProvider";
import { createWallet, importWallet, SIGN_TEST_MESSAGE } from "./src/wallet/walletService";
import { saveMnemonic } from "./src/wallet/secureStorage";
import { CHAIN, PAYMENT_FORWARDER } from "./src/chain/config";
import { colors, spacing } from "./src/theme";

const QRCodeGenerator = require("qrcode");

type OnboardingStep = "home" | "create" | "backup" | "import";
type TabKey = "wallet" | "receive" | "history" | "settings";

type PendingWallet = {
  mnemonic: string;
  address: string;
};

type FatalBoundaryState = {
  error: string | null;
  stack: string | null;
};

class StartupErrorBoundary extends React.Component<
  { children: React.ReactNode },
  FatalBoundaryState
> {
  state: FatalBoundaryState = {
    error: null,
    stack: null,
  };

  static getDerivedStateFromError(error: Error): FatalBoundaryState {
    return {
      error: error.message,
      stack: error.stack ?? null,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[MooErrorBoundary]", error.message, error.stack ?? "no stack", info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.gapLarge}>
          <Text style={styles.hero}>Moo Wallet</Text>
          <Text style={styles.errorTitle}>Startup Error</Text>
          <Text style={styles.errorText}>{this.state.error}</Text>
          {this.state.stack ? <Text style={styles.errorStack}>{this.state.stack}</Text> : null}
        </ScrollView>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  console.log("[MooApp] App root render");

  return (
    <StartupErrorBoundary>
      <WalletProvider>
        <StatusBar style="light" />
        <WalletShell />
      </WalletProvider>
    </StartupErrorBoundary>
  );
}

function WalletShell() {
  const { state, startupError, unlockFromMnemonic } = useWallet();
  const [step, setStep] = useState<OnboardingStep>("home");
  const [pendingWallet, setPendingWallet] = useState<PendingWallet | null>(null);

  useEffect(() => {
    console.log(`[MooApp] WalletShell state=${state} step=${step} startupError=${startupError ?? "none"}`);
  }, [state, step, startupError]);

  if (state === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (state !== "unlocked") {
    return (
      <OnboardingFlow
        startupError={startupError}
        step={step}
        pendingWallet={pendingWallet}
        onBack={() => setStep("home")}
        onCreate={() => {
          const wallet = createWallet();
          setPendingWallet(wallet);
          setStep("backup");
        }}
        onStartImport={() => setStep("import")}
        onShowCreateInfo={() => setStep("create")}
        onCompleteBackup={async (mnemonic) => {
          await saveMnemonic(mnemonic);
          unlockFromMnemonic(mnemonic);
          setPendingWallet(null);
          setStep("home");
        }}
        onCompleteImport={async (mnemonic) => {
          const wallet = importWallet(mnemonic);
          await saveMnemonic(wallet.mnemonic);
          unlockFromMnemonic(wallet.mnemonic);
          setStep("home");
        }}
      />
    );
  }

  return <MainTabs />;
}

function OnboardingFlow(props: {
  startupError: string | null;
  step: OnboardingStep;
  pendingWallet: PendingWallet | null;
  onBack: () => void;
  onCreate: () => void;
  onStartImport: () => void;
  onShowCreateInfo: () => void;
  onCompleteBackup: (mnemonic: string) => Promise<void>;
  onCompleteImport: (mnemonic: string) => Promise<void>;
}) {
  if (props.step === "create") {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Generate a new wallet</Text>
        <Text style={styles.body}>
          A 12-word recovery phrase will be generated on-device. It is the only
          way to recover your funds.
        </Text>
        <PrimaryButton title="Generate Recovery Phrase" onPress={props.onCreate} />
        <SecondaryButton title="Back" onPress={props.onBack} />
      </View>
    );
  }

  if (props.step === "backup" && props.pendingWallet) {
    return (
      <BackupScreen
        wallet={props.pendingWallet}
        onComplete={props.onCompleteBackup}
        onBack={props.onBack}
      />
    );
  }

  if (props.step === "import") {
    return <ImportScreen onImport={props.onCompleteImport} onBack={props.onBack} />;
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.hero}>Moo Wallet</Text>
      {props.startupError ? <Text style={styles.errorText}>{props.startupError}</Text> : null}
      <Text style={styles.body}>
        Offline-ready Polygon wallet. Your recovery phrase stays encrypted on this
        device using secure storage.
      </Text>
      <PrimaryButton title="Create New Wallet" onPress={props.onShowCreateInfo} />
      <SecondaryButton title="Import Existing Wallet" onPress={props.onStartImport} />
    </View>
  );
}

function BackupScreen({
  wallet,
  onComplete,
  onBack,
}: {
  wallet: PendingWallet;
  onComplete: (mnemonic: string) => Promise<void>;
  onBack: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const words = useMemo(() => wallet.mnemonic.split(" "), [wallet.mnemonic]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.gapLarge}>
      <Text style={styles.warningText}>
        Write these 12 words down in order. Anyone with this phrase controls your wallet.
      </Text>
      <Text style={styles.monoSmall}>Address: {wallet.address}</Text>
      <View style={styles.wordGrid}>
        {words.map((word, index) => (
          <View key={`${word}-${index}`} style={styles.wordCell}>
            <Text style={styles.wordIndex}>{index + 1}</Text>
            <Text style={styles.wordText}>{word}</Text>
          </View>
        ))}
      </View>
      <SecondaryButton
        title={copied ? "Copied" : "Copy Phrase"}
        onPress={async () => {
          await Clipboard.setStringAsync(wallet.mnemonic);
          setCopied(true);
        }}
      />
      <Pressable style={styles.checkboxRow} onPress={() => setConfirmed((v) => !v)}>
        <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
          {confirmed ? <Text style={styles.checkmark}>OK</Text> : null}
        </View>
        <Text style={styles.body}>I have written down my recovery phrase safely.</Text>
      </Pressable>
      <PrimaryButton
        title={saving ? "Saving..." : "Continue to Wallet"}
        disabled={!confirmed || saving}
        onPress={async () => {
          setSaving(true);
          try {
            await onComplete(wallet.mnemonic);
          } finally {
            setSaving(false);
          }
        }}
      />
      <SecondaryButton title="Back" onPress={onBack} />
    </ScrollView>
  );
}

function ImportScreen({
  onImport,
  onBack,
}: {
  onImport: (mnemonic: string) => Promise<void>;
  onBack: () => void;
}) {
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.title}>Import Wallet</Text>
      <Text style={styles.body}>Paste your 12 or 24-word recovery phrase.</Text>
      <TextInput
        style={styles.input}
        multiline
        placeholder="word1 word2 word3 ..."
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        value={phrase}
        onChangeText={setPhrase}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <PrimaryButton
        title={loading ? "Importing..." : "Import Wallet"}
        disabled={loading || phrase.trim().length < 10}
        onPress={async () => {
          setLoading(true);
          setError(null);
          try {
            await onImport(phrase);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Import failed");
          } finally {
            setLoading(false);
          }
        }}
      />
      <SecondaryButton title="Back" onPress={onBack} />
    </KeyboardAvoidingView>
  );
}

function MainTabs() {
  const [tab, setTab] = useState<TabKey>("wallet");

  return (
    <View style={styles.appFrame}>
      <View style={styles.contentArea}>
        {tab === "wallet" ? <WalletTab /> : null}
        {tab === "receive" ? <ReceiveTab /> : null}
        {tab === "history" ? <HistoryTab /> : null}
        {tab === "settings" ? <SettingsTab /> : null}
      </View>
      <View style={styles.tabBar}>
        {[
          ["wallet", "Wallet"],
          ["receive", "Receive"],
          ["history", "History"],
          ["settings", "Settings"],
        ].map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key as TabKey)} style={styles.tabButton}>
            <Text style={[styles.tabLabel, tab === key && styles.tabLabelActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function WalletTab() {
  const { address, balances, balancesLoading, balancesError, refreshBalances } = useWallet();
  const [offline, setOffline] = useState(false);
  const [copied, setCopied] = useState(false);

  return (
    <ScrollView
      style={styles.screen}
      refreshControl={
        <RefreshControl
          refreshing={balancesLoading}
          tintColor={colors.accent}
          onRefresh={async () => {
            const state = await Network.getNetworkStateAsync();
            setOffline(!state.isConnected);
            await refreshBalances();
          }}
        />
      }
    >
      <Text style={styles.networkTag}>{CHAIN.name}</Text>
      {offline ? <Text style={styles.warningText}>No connection. Balances may be stale.</Text> : null}
      {balancesError ? <Text style={styles.errorText}>{balancesError}</Text> : null}
      <Pressable
        style={styles.card}
        onPress={async () => {
          if (!address) return;
          await Clipboard.setStringAsync(address);
          setCopied(true);
        }}
      >
        <Text style={styles.sectionLabel}>Your address</Text>
        <Text style={styles.addressBig}>{address ?? "?"}</Text>
        <Text style={styles.linkText}>{copied ? "Copied" : "Tap to copy"}</Text>
      </Pressable>
      <Text style={styles.title}>Balances</Text>
      {balances.map((item) => (
        <View key={item.symbol} style={styles.balanceRow}>
          <Text style={styles.balanceSymbol}>{item.symbol}</Text>
          <Text style={styles.balanceValue}>{item.error ? "Unavailable" : item.balance}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function ReceiveTab() {
  const { address } = useWallet();

  return (
    <ScrollView contentContainerStyle={[styles.screen, styles.centeredContent]}>
      <Text style={styles.title}>Receive</Text>
      <Text style={styles.body}>Share this address or QR code to receive funds on Polygon Amoy.</Text>
      {address ? (
        <View style={styles.qrWrap}>
          <AddressQr value={address} size={220} />
        </View>
      ) : null}
      <Text style={styles.monoSmall}>{address}</Text>
    </ScrollView>
  );
}

function AddressQr({ value, size }: { value: string; size: number }) {
  console.log(`[MooApp] Generating receive QR for ${value}`);

  const qr = useMemo(
    () => QRCodeGenerator.create(value, { errorCorrectionLevel: "M" }).modules,
    [value]
  );
  const cellSize = Math.max(4, Math.floor(size / qr.size));
  const qrSize = cellSize * qr.size;

  return (
    <View style={[styles.qrMatrix, { width: qrSize, height: qrSize }]}>
      {Array.from({ length: qr.size }, (_, row) => (
        <View key={`row-${row}`} style={styles.qrRow}>
          {Array.from({ length: qr.size }, (_, col) => (
            <View
              key={`cell-${row}-${col}`}
              style={[
                styles.qrCell,
                {
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: qr.get(row, col) ? colors.background : colors.text,
                },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function HistoryTab() {
  return (
    <View style={[styles.screen, styles.centeredContent]}>
      <Text style={styles.title}>No transactions yet</Text>
      <Text style={styles.body}>Transactions will appear here once settlement history is wired in later phases.</Text>
    </View>
  );
}

function SettingsTab() {
  const { address, signTestMessage, logout } = useWallet();
  const [result, setResult] = useState<{ signature: string; valid: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.gapLarge}>
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Network</Text>
        <Text style={styles.body}>{CHAIN.name}</Text>
        <Text style={styles.monoSmall}>Chain ID: {CHAIN.chainId}</Text>
        <Text style={styles.monoSmall}>Forwarder: {PAYMENT_FORWARDER}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Sign test</Text>
        <Text style={styles.body}>Signs "{SIGN_TEST_MESSAGE}" and verifies it against {address}.</Text>
        <PrimaryButton
          title={loading ? "Signing..." : "Run Sign Test"}
          disabled={loading}
          onPress={async () => {
            setLoading(true);
            try {
              const next = await signTestMessage();
              setResult(next);
            } finally {
              setLoading(false);
            }
          }}
        />
        {result ? (
          <>
            <Text style={[styles.sectionLabel, { color: result.valid ? colors.success : colors.error }]}>
              {result.valid ? "Signature valid" : "Signature invalid"}
            </Text>
            <Text style={styles.monoSmall}>{result.signature}</Text>
          </>
        ) : null}
      </View>
      <PrimaryButton
        title="Log Out"
        onPress={async () => {
          await logout();
        }}
      />
    </ScrollView>
  );
}

function PrimaryButton({ title, onPress, disabled = false }: { title: string; onPress: () => void | Promise<void>; disabled?: boolean; }) {
  return (
    <Pressable onPress={() => void onPress()} disabled={disabled} style={[styles.button, disabled && styles.buttonDisabled]}>
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

function SecondaryButton({ title, onPress }: { title: string; onPress: () => void | Promise<void>; }) {
  return (
    <Pressable onPress={() => void onPress()} style={[styles.button, styles.secondaryButton]}>
      <Text style={styles.secondaryButtonText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  appFrame: { flex: 1, backgroundColor: colors.background },
  contentArea: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  centeredContent: { alignItems: "center", justifyContent: "center", gap: spacing.md },
  gapLarge: { gap: spacing.lg },
  hero: { fontSize: 32, fontWeight: "700", color: colors.text, marginBottom: spacing.md },
  title: { fontSize: 22, fontWeight: "600", color: colors.text, marginBottom: spacing.md },
  errorTitle: { fontSize: 20, fontWeight: "700", color: colors.error },
  body: { fontSize: 15, lineHeight: 22, color: colors.textMuted, marginBottom: spacing.md },
  warningText: { color: colors.warning, marginBottom: spacing.md },
  errorText: { color: colors.error, marginBottom: spacing.md },
  errorStack: { color: colors.textMuted, fontFamily: "monospace", fontSize: 12, lineHeight: 18 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: spacing.lg, marginBottom: spacing.md },
  sectionLabel: { color: colors.text, fontWeight: "600", marginBottom: spacing.sm, fontSize: 16 },
  addressBig: { color: colors.text, fontSize: 16, fontFamily: "monospace" },
  linkText: { color: colors.accent, marginTop: spacing.sm },
  networkTag: { color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: spacing.sm },
  balanceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  balanceSymbol: { color: colors.text, fontWeight: "600" },
  balanceValue: { color: colors.text },
  qrWrap: { backgroundColor: colors.text, padding: spacing.md, borderRadius: 16, marginVertical: spacing.lg },
  qrMatrix: { overflow: "hidden" },
  qrRow: { flexDirection: "row" },
  qrCell: {},
  monoSmall: { color: colors.textMuted, fontFamily: "monospace", fontSize: 12, lineHeight: 18 },
  input: { minHeight: 140, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, padding: spacing.md, textAlignVertical: "top", marginBottom: spacing.md },
  wordGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  wordCell: { width: "47%", flexDirection: "row", gap: spacing.sm, backgroundColor: colors.surface, borderRadius: 10, padding: spacing.sm },
  wordIndex: { color: colors.textMuted, width: 20 },
  wordText: { color: colors.text, fontWeight: "500" },
  checkboxRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.text, fontWeight: "700" },
  button: { minHeight: 50, borderRadius: 12, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.text, fontSize: 16, fontWeight: "600" },
  secondaryButton: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textMuted, fontSize: 16, fontWeight: "600" },
  tabBar: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  tabButton: { flex: 1, paddingVertical: spacing.md, alignItems: "center" },
  tabLabel: { color: colors.textMuted, fontWeight: "600" },
  tabLabelActive: { color: colors.accent },
});


