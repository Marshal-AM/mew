import "./src/crypto/setup";
import "./src/logging/install";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { formatUnits } from "ethers";
import { WalletProvider, useWallet } from "./src/context/WalletProvider";
import { createWallet, importWallet, SIGN_TEST_MESSAGE } from "./src/wallet/walletService";
import { saveMnemonic } from "./src/wallet/secureStorage";
import { CHAIN, PAYMENT_FORWARDER } from "./src/chain/config";
import { colors, spacing } from "./src/theme";
import { PayTab } from "./src/components/PayTab";
import { getPayoutAddress, getRegistryMeta, listPosRegistry, setPayoutAddress } from "./src/cache/posRegistry";
import { type PendingPayment } from "./src/cache/pendingPayments";
import { loadPaymentHistory, statusLabel } from "./src/cache/transactionSync";
import {
  getCustomerScreeningRecord,
  registerCustomerKyc,
  isScreeningConfigured,
  type CustomerScreeningRecord,
} from "./src/lib/screening";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearLogs, getLogs, subscribeLogs, type LogEntry } from "./src/logging/appLogs";

const SCREENING_STATUS_KEY_PREFIX = "moo_screening_status_v2";
const SCREENING_NAME_KEY_PREFIX = "moo_screening_name_v2";
const QRCodeGenerator = require("qrcode");

type OnboardingStep = "home" | "create" | "backup" | "import" | "kyc";
type TabKey = "wallet" | "receive" | "pay" | "history" | "settings" | "logs";

type PendingWallet = {
  mnemonic: string;
  address: string;
};

function screeningStatusKey(walletAddress: string): string {
  return `${SCREENING_STATUS_KEY_PREFIX}:${walletAddress.toLowerCase()}`;
}

function screeningNameKey(walletAddress: string): string {
  return `${SCREENING_NAME_KEY_PREFIX}:${walletAddress.toLowerCase()}`;
}

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
        onCompleteBackup={() => {
          setStep("kyc");
        }}
        onCompleteImport={async (mnemonic) => {
          const wallet = importWallet(mnemonic);
          setPendingWallet(wallet);
          console.log("[KYC] imported wallet pending screening", { wallet: wallet.address });
          setStep("kyc");
        }}
        onCompleteKyc={async (mnemonic, fullName, idDocRef) => {
          if (!pendingWallet) return;
          console.log("[KYC] onboarding submit start", {
            wallet: pendingWallet.address,
            fullName,
            hasIdDocRef: Boolean(idDocRef),
            screeningConfigured: isScreeningConfigured(),
          });
          if (isScreeningConfigured()) {
            const result = await registerCustomerKyc(pendingWallet.address, fullName, idDocRef);
            console.log("[KYC] onboarding register-customer success", {
              wallet: pendingWallet.address,
              customerId: result.customer_id,
              screeningStatus: result.screening_status,
              screening: result.screening,
            });
            await AsyncStorage.multiSet([
              [screeningStatusKey(pendingWallet.address), result.screening_status],
              [screeningNameKey(pendingWallet.address), fullName],
            ]);
            if (result.screening_status === "blocked") {
              throw new Error("Identity screening blocked wallet registration");
            }
            const record = await getCustomerScreeningRecord(pendingWallet.address);
            console.log("[KYC] onboarding backend screening record", {
              wallet: pendingWallet.address,
              record,
            });
            if (!record?.full_name || record.screening_status !== "cleared") {
              throw new Error(
                "Screening did not persist for this wallet. Please try again before continuing."
              );
            }
          }
          Alert.alert(
            "Wallet screening successful",
            `Wallet ${pendingWallet.address} is cleared and can proceed.`,
            [
              {
                text: "OK",
                onPress: () => {
                  void (async () => {
                    console.log("[KYC] onboarding success acknowledged", {
                      wallet: pendingWallet.address,
                    });
                    await saveMnemonic(mnemonic);
                    unlockFromMnemonic(mnemonic);
                    setPendingWallet(null);
                    setStep("home");
                  })();
                },
              },
            ]
          );
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
  onCompleteBackup: () => void;
  onCompleteImport: (mnemonic: string) => Promise<void>;
  onCompleteKyc: (mnemonic: string, fullName: string, idDocRef?: string) => Promise<void>;
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
        onContinue={props.onCompleteBackup}
        onBack={props.onBack}
      />
    );
  }

  if (props.step === "kyc" && props.pendingWallet) {
    return (
      <KycScreen
        wallet={props.pendingWallet}
        onComplete={async (fullName, idDocRef) => {
          await props.onCompleteKyc(props.pendingWallet!.mnemonic, fullName, idDocRef);
        }}
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
  onContinue,
  onBack,
}: {
  wallet: PendingWallet;
  onContinue: () => void;
  onBack: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
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
        title="Continue to KYC"
        disabled={!confirmed}
        onPress={onContinue}
      />
      <SecondaryButton title="Back" onPress={onBack} />
    </ScrollView>
  );
}

function KycScreen({
  wallet,
  onComplete,
  onBack,
}: {
  wallet: PendingWallet;
  onComplete: (fullName: string, idDocRef?: string) => Promise<void>;
  onBack: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [idDocRef, setIdDocRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.gapLarge}>
        <Text style={styles.title}>Identity Verification</Text>
        <Text style={styles.body}>
          Required before funding. Your name is screened against sanctions lists (UN Security Council and UAE local lists).
        </Text>
        <Text style={styles.monoSmall}>Wallet: {wallet.address}</Text>
        <Text style={styles.sectionLabel}>Full legal name</Text>
        <TextInput
          style={styles.input}
          placeholder="Jane Doe"
          placeholderTextColor={colors.textMuted}
          value={fullName}
          onChangeText={setFullName}
        />
        <Text style={styles.sectionLabel}>ID reference (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="Passport / Emirates ID"
          placeholderTextColor={colors.textMuted}
          value={idDocRef}
          onChangeText={setIdDocRef}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <PrimaryButton
          title={loading ? "Screening..." : "Submit & Continue"}
          disabled={loading || fullName.trim().length < 2}
          onPress={async () => {
            setLoading(true);
            setError(null);
            try {
              await onComplete(fullName.trim(), idDocRef.trim() || undefined);
            } catch (err) {
              setError(err instanceof Error ? err.message : "KYC screening failed");
            } finally {
              setLoading(false);
            }
          }}
        />
        <SecondaryButton title="Back" onPress={onBack} />
      </ScrollView>
    </KeyboardAvoidingView>
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
        {tab === "pay" ? <PayTab PrimaryButton={PrimaryButton} /> : null}
        {tab === "history" ? <HistoryTab /> : null}
        {tab === "settings" ? <SettingsTab /> : null}
        {tab === "logs" ? <LogsTab /> : null}
      </View>
      <View style={styles.tabBar}>
        {[
          ["wallet", "Wallet"],
          ["receive", "Receive"],
          ["pay", "Pay"],
          ["history", "History"],
          ["settings", "Settings"],
          ["logs", "Logs"],
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
  const [screeningStatus, setScreeningStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setScreeningStatus(null);
      return;
    }
    void AsyncStorage.getItem(screeningStatusKey(address)).then(setScreeningStatus);
  }, [address]);

  const blocked = screeningStatus === "blocked";
  const pending = screeningStatus !== "cleared";

  return (
    <ScrollView contentContainerStyle={[styles.screen, styles.centeredContent]}>
      <Text style={styles.title}>Receive</Text>
      {blocked ? (
        <Text style={styles.errorText}>Funding is blocked — identity screening did not clear.</Text>
      ) : pending ? (
        <Text style={styles.warningText}>Complete KYC screening before receiving funds.</Text>
      ) : (
        <Text style={styles.body}>Share this address or QR code to receive funds on Polygon Amoy.</Text>
      )}
      {address && !blocked ? (
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
  const { syncTransactions, transactionSyncError } = useWallet();
  const [items, setItems] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await syncTransactions();
      setItems(await loadPaymentHistory());
    } finally {
      setLoading(false);
    }
  }, [syncTransactions]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.gapLarge}>
      <Text style={styles.title}>History</Text>
      <Text style={styles.body}>
        Payments sync from the merchant backend when online. Pending items update once the pipeline settles on-chain.
      </Text>
      {transactionSyncError ? <Text style={styles.warningText}>{transactionSyncError}</Text> : null}
      <PrimaryButton title="Refresh" onPress={() => void refresh()} />
      {loading ? <ActivityIndicator color={colors.accent} /> : null}
      {!loading && items.length === 0 ? (
        <Text style={styles.body}>No payments yet.</Text>
      ) : null}
      {items.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text
            style={[
              styles.sectionLabel,
              {
                color:
                  item.status === "confirmed"
                    ? colors.success
                    : item.status === "pending"
                      ? colors.warning
                      : colors.error,
              },
            ]}
          >
            {statusLabel(item.status)}
          </Text>
          <Text style={styles.monoSmall}>{formatUnits(item.value, 6)} MOO</Text>
          <Text style={styles.monoSmall}>posId: {item.posId}</Text>
          <Text style={styles.monoSmall}>reqId: {item.reqId}</Text>
          <Text style={styles.monoSmall}>to: {item.to}</Text>
          {item.txHash ? <Text style={styles.monoSmall}>tx: {item.txHash}</Text> : null}
          <Text style={styles.monoSmall}>created: {new Date(item.createdAt).toLocaleString()}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function SettingsTab() {
  const { address, signTestMessage, logout, syncPosRegistry, posRegistrySyncError, approvalStatus } = useWallet();
  const [result, setResult] = useState<{ signature: string; valid: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [posId, setPosId] = useState("POS-001");
  const [payoutAddress, setPayoutAddressInput] = useState("");
  const [registryStatus, setRegistryStatus] = useState<string | null>(null);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryMeta, setRegistryMeta] = useState<{ lastSyncedAt: string | null; deviceCount: number } | null>(null);
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
    console.log("[KYC] refresh current wallet status start", { wallet: address });
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
      console.log("[KYC] refresh current wallet status result", { wallet: address, record });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load KYC status";
      setScreeningStatusText(message);
      console.error("[KYC] refresh current wallet status failed", { wallet: address, message });
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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.gapLarge}>
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Wallet screening</Text>
        <Text style={styles.body}>
          Root cause: the old app only saved a global local screening flag and never checked the backend record for the currently unlocked wallet. This view shows the live backend status for the active wallet and lets you re-run screening for this exact wallet.
        </Text>
        <Text style={styles.monoSmall}>Wallet: {address ?? "No wallet loaded"}</Text>
        {screeningRecord ? (
          <>
            <Text style={styles.monoSmall}>Backend name: {screeningRecord.full_name ?? "missing"}</Text>
            <Text style={styles.monoSmall}>Backend status: {screeningRecord.screening_status}</Text>
            <Text style={styles.monoSmall}>Screened at: {screeningRecord.screened_at ?? "not yet"}</Text>
          </>
        ) : null}
        {screeningStatusText ? <Text style={styles.body}>{screeningStatusText}</Text> : null}
        <Text style={styles.monoSmall}>Full legal name</Text>
        <TextInput
          value={screeningName}
          onChangeText={setScreeningName}
          style={styles.singleLineInput}
          placeholder="Jane Doe"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.monoSmall}>ID reference</Text>
        <TextInput
          value={screeningDocRef}
          onChangeText={setScreeningDocRef}
          style={styles.singleLineInput}
          placeholder="Passport / Emirates ID"
          placeholderTextColor={colors.textMuted}
        />
        <View style={styles.buttonRow}>
          <PrimaryButton
            title={screeningLoading ? "Submitting..." : "Run screening for this wallet"}
            disabled={!address || screeningLoading || screeningName.trim().length < 2}
            onPress={async () => {
              if (!address) return;
              setScreeningLoading(true);
              setScreeningStatusText(null);
              console.log("[KYC] current wallet screening submit start", {
                wallet: address,
                fullName: screeningName.trim(),
                hasIdDocRef: Boolean(screeningDocRef.trim()),
              });
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
                console.log("[KYC] current wallet register-customer success", {
                  wallet: address,
                  customerId: result.customer_id,
                  screeningStatus: result.screening_status,
                  screening: result.screening,
                });
                const record = await getCustomerScreeningRecord(address);
                console.log("[KYC] current wallet backend screening record", {
                  wallet: address,
                  record,
                });
                setScreeningRecord(record);
                if (!record?.full_name || record.screening_status !== "cleared") {
                  throw new Error(
                    "Screening response returned, but backend did not persist a cleared status for this wallet."
                  );
                }
                setScreeningStatusText(`Backend status: ${record.screening_status} for ${record.full_name}`);
                Alert.alert(
                  "Wallet screening successful",
                  `Wallet ${address} is whitelisted for transactions.`,
                  [{ text: "OK" }]
                );
              } catch (err) {
                const message = err instanceof Error ? err.message : "KYC screening failed";
                setScreeningStatusText(message);
                console.error("[KYC] current wallet screening failed", { wallet: address, message });
              } finally {
                setScreeningLoading(false);
              }
            }}
          />
          <SecondaryButton
            title="Refresh backend status"
            onPress={async () => {
              await refreshScreening();
            }}
          />
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>POS payout mapping</Text>
        <Text style={styles.body}>
          The preferred path is embedding the payout address directly in the POS QR. This registry cache is only a legacy fallback.
        </Text>
        <Text style={styles.monoSmall}>Cached devices: {registryMeta?.deviceCount ?? 0}</Text>
        <Text style={styles.monoSmall}>Last synced: {registryMeta?.lastSyncedAt ?? "never"}</Text>
        {posRegistrySyncError ? <Text style={styles.warningText}>{posRegistrySyncError}</Text> : null}
        <PrimaryButton
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
        <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>Manual fallback override</Text>
        <Text style={styles.body}>Only needed if a POS QR does not carry a payout address yet.</Text>
        <Text style={styles.monoSmall}>posId</Text>
        <TextInput
          value={posId}
          onChangeText={setPosId}
          style={styles.input}
          autoCapitalize="characters"
        />
        <Text style={styles.monoSmall}>payout address</Text>
        <TextInput
          value={payoutAddress}
          onChangeText={setPayoutAddressInput}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <PrimaryButton
          title={registryLoading ? "Saving..." : "Save payout mapping"}
          disabled={registryLoading || posId.trim().length === 0 || payoutAddress.trim().length === 0}
          onPress={async () => {
            setRegistryLoading(true);
            setRegistryStatus(null);
            try {
              await setPayoutAddress(posId.trim(), payoutAddress.trim());
              const saved = await getPayoutAddress(posId.trim());
              setPayoutAddressInput(saved);
              setRegistryStatus(`Saved ${posId.trim()} â†’ ${saved}`);
            } catch (err) {
              setRegistryStatus(err instanceof Error ? err.message : "Failed to save mapping");
            } finally {
              setRegistryLoading(false);
            }
          }}
        />
        {registryStatus ? <Text style={styles.body}>{registryStatus}</Text> : null}
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Network</Text>
        <Text style={styles.body}>{CHAIN.name}</Text>
        <Text style={styles.monoSmall}>Chain ID: {CHAIN.chainId}</Text>
        <Text style={styles.monoSmall}>Forwarder: {PAYMENT_FORWARDER}</Text>
        {approvalStatus ? <Text style={styles.body}>{approvalStatus}</Text> : null}
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

function LogsTab() {
  const [items, setItems] = useState<LogEntry[]>(() => getLogs());

  useEffect(() => subscribeLogs(() => setItems(getLogs())), []);

  const text = items
    .map((item) => `[${item.timestamp}] ${item.level.toUpperCase()} ${item.message}`)
    .join("\n");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.gapLarge}>
      <Text style={styles.title}>Logs</Text>
      <Text style={styles.body}>
        App, BLE, wallet, pay-flow, and error logs are captured here. Look for tags like
        {" "}[Pay], [BLE], [Transfer], [Allowance], [Registry], and [Sign] while testing payments.
      </Text>
      <View style={styles.buttonRow}>
        <SecondaryButton
          title="Copy Logs"
          onPress={async () => {
            await Clipboard.setStringAsync(text || "No logs yet.");
          }}
        />
        <SecondaryButton
          title="Clear Logs"
          onPress={async () => {
            clearLogs();
          }}
        />
      </View>
      {items.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.body}>No logs yet.</Text>
        </View>
      ) : (
        items
          .slice()
          .reverse()
          .map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.monoSmall}>
                [{new Date(item.timestamp).toLocaleTimeString()}] {item.level.toUpperCase()}
              </Text>
              <Text style={styles.body}>{item.message}</Text>
            </View>
          ))
      )}
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
  singleLineInput: { minHeight: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, padding: spacing.md, marginBottom: spacing.md },
  wordGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  wordCell: { width: "47%", flexDirection: "row", gap: spacing.sm, backgroundColor: colors.surface, borderRadius: 10, padding: spacing.sm },
  wordIndex: { color: colors.textMuted, width: 20 },
  wordText: { color: colors.text, fontWeight: "500" },
  checkboxRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkmark: { color: colors.text, fontWeight: "700" },
  buttonRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
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



