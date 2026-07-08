import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Network from "expo-network";
import { Device } from "react-native-ble-plx";
import { formatUnits, parseUnits } from "ethers";
import { colors, spacing } from "../theme";
import { parsePaymentRequestJson, PaymentRequest } from "../protocol/paymentRequest";
import { serializeSignedPayment } from "../protocol/signedPayment";
import { requestBlePermissions, scanForPosDevice, waitForPoweredOn } from "../ble/BleManager";
import { sendSignedPayment, TransferProgress } from "../ble/transfer";
import { fetchPosDevice, getPayoutAddress, truncateAddress } from "../cache/posRegistry";
import { addPendingPayment, listPendingPayments } from "../cache/pendingPayments";
import { createSigningSession } from "../wallet/authGate";
import { MOO_DECIMALS, MOO_TOKEN_ADDRESS } from "../wallet/eip712";
import { getTokenAllowance } from "../chain/allowances";
import { PAYMENT_FORWARDER } from "../chain/config";
import { useWallet } from "../context/WalletProvider";

type PayTabProps = {
  PrimaryButton: React.ComponentType<{ title: string; onPress: () => void | Promise<void>; disabled?: boolean }>;
};

export function PayTab({ PrimaryButton }: PayTabProps) {
  const { state, address, signPaymentAuthorization, syncTransactions } = useWallet();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [manualPosId, setManualPosId] = useState("POS-001");
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);
  const [payoutAddress, setPayoutAddress] = useState<string | null>(null);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutSource, setPayoutSource] = useState<string | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [status, setStatus] = useState<string>("Scan a POS QR code to begin.");
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [allowanceOk, setAllowanceOk] = useState<boolean | null>(null);
  const [allowanceMessage, setAllowanceMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingId) return;
    let cancelled = false;
    const poll = async () => {
      await syncTransactions();
      if (cancelled) return;
      const items = await listPendingPayments();
      const item = items.find((p) => p.id === pendingId);
      if (item && item.status === "confirmed") {
        setStatus(`Payment confirmed on-chain${item.txHash ? `: ${item.txHash.slice(0, 14)}...` : "."}`);
      } else if (item && item.status !== "pending") {
        setStatus(`Payment ${item.status.replace("_", " ")}.`);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pendingId, syncTransactions]);

  useEffect(() => {
    void (async () => {
      await requestBlePermissions();
      if (!permission?.granted) {
        await requestPermission();
      }
    })();
  }, [permission?.granted, requestPermission]);

  const resolvePayout = async (posId: string) => {
    try {
      let payout: string;
      try {
        payout = await getPayoutAddress(posId);
        setPayoutSource("cached");
      } catch {
        const fetched = await fetchPosDevice(posId);
        if (!fetched) throw new Error(`No payout address for ${posId}. Sync POS registry while online.`);
        payout = fetched;
        setPayoutSource("synced");
      }
      setPayoutAddress(payout);
      setPayoutError(null);
    } catch (err) {
      setPayoutAddress(null);
      setPayoutError(err instanceof Error ? err.message : "Payout address not configured");
    }
  };

  const checkAllowance = async () => {
    if (!address) {
      setAllowanceOk(null);
      setAllowanceMessage(null);
      return;
    }

    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected) {
      setAllowanceOk(null);
      setAllowanceMessage("Offline â€” allowance not checked. Ensure MOO is approved while online before paying.");
      return;
    }

    try {
      const allowance = await getTokenAllowance(address, MOO_TOKEN_ADDRESS, PAYMENT_FORWARDER);
      if (paymentRequest) {
        const needed = parseUnits(paymentRequest.amt, MOO_DECIMALS);
        if (allowance < needed) {
          setAllowanceOk(false);
          setAllowanceMessage(
            `Insufficient MOO allowance for PaymentForwarder. Approve MOO while online (current: ${formatUnits(allowance, MOO_DECIMALS)}).`
          );
          return;
        }
      }
      setAllowanceOk(true);
      setAllowanceMessage(null);
    } catch {
      setAllowanceOk(null);
      setAllowanceMessage("Could not verify token allowance. Check your connection.");
    }
  };

  useEffect(() => {
    if (paymentRequest) {
      void resolvePayout(paymentRequest.posId);
      void checkAllowance();
    }
  }, [paymentRequest, address]);

  const connectToPos = async (posId: string) => {
    setBusy(true);
    setStatus("Waiting for Bluetooth...");
    setPendingId(null);
    try {
      await waitForPoweredOn();
      setStatus(`Scanning for ${posId}...`);
      const found = await scanForPosDevice(posId);
      setDevice(found);
      setStatus(`Connected to ${found.localName ?? found.name ?? found.id}`);
      await resolvePayout(posId);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "BLE scan failed");
      setDevice(null);
    } finally {
      setBusy(false);
    }
  };

  const handleBarcode = async (data: string) => {
    if (scanning) return;
    setScanning(true);
    try {
      const parsed = parsePaymentRequestJson(data);
      const now = Math.floor(Date.now() / 1000);
      if (parsed.exp <= now) {
        throw new Error("Payment request has expired. Ask the merchant to generate a new QR.");
      }
      setPaymentRequest(parsed);
      setManualPosId(parsed.posId);
      setStatus(`Parsed request for ${parsed.posId} (${parsed.amt} MOO)`);
      await connectToPos(parsed.posId);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Invalid QR payload");
    } finally {
      setScanning(false);
    }
  };

  const canPay =
    state === "unlocked" &&
    !busy &&
    !!device &&
    !!paymentRequest &&
    !!payoutAddress &&
    allowanceOk !== false;

  const handleConfirmPay = async () => {
    if (!device || !paymentRequest || !payoutAddress) return;

    const now = Math.floor(Date.now() / 1000);
    if (paymentRequest.exp <= now) {
      setStatus("Payment request expired. Scan a new QR.");
      return;
    }

    setBusy(true);
    setProgress(null);
    setPendingId(null);
    try {
      setStatus("Authenticate to authorize payment...");
      const sessionId = await createSigningSession();

      setStatus("Signing offline...");
      const signed = await signPaymentAuthorization({
        sessionId,
        request: paymentRequest,
        payoutAddress,
      });

      const json = serializeSignedPayment(signed);
      setStatus("Sending signed payment over BLE...");
      const transfer = await sendSignedPayment(device, json, setProgress);

      if (!transfer.ok) {
        setStatus(`Transfer failed: ${transfer.error}`);
        return;
      }

      const entry = await addPendingPayment(signed);
      setPendingId(entry.id);
      setStatus("Payment pending — awaiting merchant relay.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  };

  if (state !== "unlocked") {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.title}>Pay</Text>
        <Text style={styles.body}>Unlock your wallet to authorize payments.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.gapLarge}>
      <Text style={styles.title}>Pay</Text>
      <Text style={styles.body}>
        Scan the POS QR, confirm amount and payee, then authorize with biometric or PIN. Status stays
        pending until on-chain settlement (Phase 7).
      </Text>

      {permission?.granted ? (
        <View style={styles.cameraWrap}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={scanning ? undefined : ({ data }) => void handleBarcode(data)}
          />
        </View>
      ) : (
        <PrimaryButton title="Grant Camera Permission" onPress={() => void requestPermission()} />
      )}

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Manual posId</Text>
        <TextInput
          value={manualPosId}
          onChangeText={setManualPosId}
          style={styles.input}
          autoCapitalize="characters"
        />
        <PrimaryButton
          title={busy ? "Connecting..." : "Connect BLE"}
          disabled={busy || manualPosId.trim().length === 0}
          onPress={async () => {
            await connectToPos(manualPosId.trim());
          }}
        />
      </View>

      {paymentRequest ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Confirm payment</Text>
          <Text style={styles.amount}>{paymentRequest.amt} MOO</Text>
          {payoutAddress ? (
            <Text style={styles.monoSmall}>Payee: {truncateAddress(payoutAddress)}{payoutSource ? ` (${payoutSource})` : ""}</Text>
          ) : (
            <Text style={styles.warningText}>{payoutError ?? "Loading payee..."}</Text>
          )}
          <Text style={styles.monoSmall}>posId: {paymentRequest.posId}</Text>
          <Text style={styles.monoSmall}>reqId: {paymentRequest.reqId}</Text>
          <Text style={styles.monoSmall}>posNonce: {paymentRequest.posNonce}</Text>
          <Text style={styles.monoSmall}>expires: {paymentRequest.exp}</Text>
          {allowanceMessage ? <Text style={styles.warningText}>{allowanceMessage}</Text> : null}
        </View>
      ) : null}

      <Text style={styles.body}>{status}</Text>
      {device ? <Text style={styles.monoSmall}>device: {device.id}</Text> : null}
      {progress ? (
        <Text style={styles.body}>
          {progress.phase} {progress.sentChunks}/{progress.totalChunks}
          {progress.message ? ` â€” ${progress.message}` : ""}
        </Text>
      ) : null}
      {pendingId ? (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingTitle}>Pending</Text>
          <Text style={styles.monoSmall}>id: {pendingId}</Text>
          <Text style={styles.body}>Awaiting merchant relay. Status syncs when online.</Text>
        </View>
      ) : null}

      <PrimaryButton
        title={busy ? "Authorizing..." : "Confirm & Pay"}
        disabled={!canPay}
        onPress={handleConfirmPay}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  centered: { alignItems: "center", justifyContent: "center" },
  gapLarge: { gap: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 22, fontWeight: "600", color: colors.text },
  body: { fontSize: 15, lineHeight: 22, color: colors.textMuted },
  sectionLabel: { color: colors.text, fontWeight: "600", marginBottom: spacing.sm, fontSize: 16 },
  amount: { fontSize: 28, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  warningText: { color: colors.warning, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pendingCard: {
    backgroundColor: colors.surface,
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pendingTitle: { color: colors.warning, fontWeight: "700", fontSize: 16 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surfaceElevated,
    color: colors.text,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  monoSmall: { color: colors.textMuted, fontFamily: "monospace", fontSize: 12, lineHeight: 18 },
  cameraWrap: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    height: 260,
  },
  camera: { flex: 1 },
});

