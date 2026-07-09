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
import { requestPosInfo, sendSignedPayment, TransferProgress } from "../ble/transfer";
import { fetchPosDevice, getPayoutAddress, truncateAddress } from "../cache/posRegistry";
import { addPendingPayment, listPendingPayments, updatePendingStatus } from "../cache/pendingPayments";
import { MOO_DECIMALS, MOO_TOKEN_ADDRESS } from "../wallet/eip712";
import { getTokenAllowance } from "../chain/allowances";
import { PAYMENT_FORWARDER } from "../chain/config";
import { useWallet } from "../context/WalletProvider";
import { payFlowLog } from "../logging/payFlow";

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

  const resolvePayoutFromRegistry = async (posId: string) => {
    payFlowLog.info("Registry", "resolve payout from registry", { posId });
    let payout: string;
    try {
      payout = await getPayoutAddress(posId);
      setPayoutSource("cached");
      payFlowLog.info("Registry", "payout loaded from cache", { posId, payout });
    } catch {
      payFlowLog.warn("Registry", "cache miss, fetching remote registry", { posId });
      const fetched = await fetchPosDevice(posId);
      if (!fetched) {
        throw new Error(`No payout address for ${posId}. Connect to POS over BLE or set a manual mapping in Settings.`);
      }
      payout = fetched;
      setPayoutSource("synced");
      payFlowLog.info("Registry", "payout loaded from remote sync", { posId, payout });
    }
    setPayoutAddress(payout);
    setPayoutError(null);
  };

  const resolvePayout = async (posId: string, connectedDevice?: Device | null) => {
    payFlowLog.info("Pay", "resolve payout start", {
      posId,
      hasDevice: !!connectedDevice,
      deviceId: connectedDevice?.id,
    });
    try {
      if (connectedDevice) {
        try {
          payFlowLog.info("Pay", "requesting payout over BLE");
          const info = await requestPosInfo(connectedDevice);
          if (info.posId && info.posId !== posId) {
            throw new Error(`POS identity mismatch (${info.posId})`);
          }
          setPayoutAddress(info.payoutAddress);
          setPayoutSource("ble");
          setPayoutError(null);
          payFlowLog.info("Pay", "payout resolved over BLE", info);
          return;
        } catch (bleErr) {
          payFlowLog.warn("Pay", "BLE payout lookup failed, trying registry fallback", bleErr);
          setPayoutError(
            bleErr instanceof Error ? bleErr.message : "BLE payout lookup failed"
          );
        }
      }
      await resolvePayoutFromRegistry(posId);
      payFlowLog.info("Pay", "payout resolved from registry fallback", { posId, payoutSource });
    } catch (err) {
      setPayoutAddress(null);
      const message = err instanceof Error ? err.message : "Payout address not configured";
      setPayoutError(message);
      payFlowLog.error("Pay", "resolve payout failed", message);
    }
  };

  const checkAllowance = async () => {
    if (!address) {
      payFlowLog.info("Allowance", "skipped - no wallet address");
      setAllowanceOk(null);
      setAllowanceMessage(null);
      return;
    }

    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected) {
      payFlowLog.info("Allowance", "skipped - offline");
      setAllowanceOk(null);
      setAllowanceMessage(null);
      return;
    }

    try {
      payFlowLog.info("Allowance", "checking", {
        owner: address,
        token: MOO_TOKEN_ADDRESS,
        spender: PAYMENT_FORWARDER,
        amount: paymentRequest?.amt,
      });
      const allowance = await getTokenAllowance(address, MOO_TOKEN_ADDRESS, PAYMENT_FORWARDER);
      if (paymentRequest) {
        const needed = parseUnits(paymentRequest.amt, MOO_DECIMALS);
        payFlowLog.info("Allowance", "result", {
          allowance: formatUnits(allowance, MOO_DECIMALS),
          needed: paymentRequest.amt,
        });
        if (allowance < needed) {
          setAllowanceOk(false);
          const message = `Insufficient MOO allowance for PaymentForwarder. Approve MOO while online (current: ${formatUnits(allowance, MOO_DECIMALS)}).`;
          setAllowanceMessage(message);
          payFlowLog.warn("Allowance", "insufficient", message);
          return;
        }
      }
      setAllowanceOk(true);
      setAllowanceMessage(null);
      payFlowLog.info("Allowance", "ok");
    } catch (err) {
      setAllowanceOk(null);
      setAllowanceMessage("Could not verify MOO allowance right now.");
      payFlowLog.warn("Allowance", "check failed", err);
    }
  };

  useEffect(() => {
    if (paymentRequest) {
      void checkAllowance();
    }
  }, [paymentRequest, address]);

  const connectToPos = async (posId: string) => {
    setBusy(true);
    setStatus("Waiting for Bluetooth...");
    setPendingId(null);
    payFlowLog.info("Pay", "connect to POS start", { posId });
    try {
      await waitForPoweredOn();
      setStatus(`Scanning for ${posId}...`);
      const found = await scanForPosDevice(posId);
      setDevice(found);
      const deviceLabel = found.localName ?? found.name ?? found.id;
      setStatus(`Connected to ${deviceLabel}`);
      payFlowLog.info("Pay", "device selected", { posId, deviceId: found.id, name: deviceLabel });
      await resolvePayout(posId, found);
      payFlowLog.info("Pay", "connect to POS complete", { posId, deviceId: found.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : "BLE scan failed";
      setStatus(message);
      setDevice(null);
      payFlowLog.error("Pay", "connect to POS failed", message);
    } finally {
      setBusy(false);
    }
  };

  const handleBarcode = async (data: string) => {
    if (scanning) return;
    setScanning(true);
    payFlowLog.info("Pay", "QR scanned", data.length > 120 ? `${data.slice(0, 120)}...` : data);
    try {
      const parsed = parsePaymentRequestJson(data);
      const now = Math.floor(Date.now() / 1000);
      payFlowLog.info("Pay", "QR parsed", { ...parsed, now, ttlRemainingSec: parsed.exp - now });
      if (parsed.exp <= now) {
        throw new Error("Payment request has expired. Ask the merchant to generate a new QR.");
      }
      setPaymentRequest(parsed);
      setManualPosId(parsed.posId);
      setStatus(`Parsed request for ${parsed.posId} (${parsed.amt} MOO)`);
      await connectToPos(parsed.posId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid QR payload";
      setStatus(message);
      payFlowLog.error("Pay", "QR handling failed", message);
    } finally {
      setScanning(false);
    }
  };

  const payBlockers: string[] = [];
  if (state !== "unlocked") payBlockers.push("wallet locked");
  if (busy) payBlockers.push("busy");
  if (!device) payBlockers.push("BLE not connected");
  if (!paymentRequest) payBlockers.push("no payment request");
  if (!payoutAddress) payBlockers.push("payee address missing");
  if (allowanceOk === false) payBlockers.push("MOO allowance too low");

  const canPay = payBlockers.length === 0;

  useEffect(() => {
    if (!paymentRequest) return;
    payFlowLog.info("Pay", "pay readiness", {
      canPay,
      blockers: payBlockers,
      payoutAddress,
      payoutSource,
      payoutError,
      allowanceOk,
      deviceId: device?.id ?? null,
      busy,
    });
  }, [paymentRequest, canPay, payBlockers.join("|"), payoutAddress, payoutSource, payoutError, allowanceOk, device?.id, busy]);

  const handleConfirmPay = async () => {
    if (!device || !paymentRequest || !payoutAddress) {
      payFlowLog.warn("Pay", "confirm blocked by missing state", {
        hasDevice: !!device,
        hasPaymentRequest: !!paymentRequest,
        hasPayoutAddress: !!payoutAddress,
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    if (paymentRequest.exp <= now) {
      setStatus("Payment request expired. Scan a new QR.");
      payFlowLog.warn("Pay", "confirm blocked - expired", { exp: paymentRequest.exp, now });
      return;
    }

    setBusy(true);
    setProgress(null);
    setPendingId(null);
    payFlowLog.info("Pay", "confirm pay start", {
      posId: paymentRequest.posId,
      amt: paymentRequest.amt,
      payoutAddress,
      payoutSource,
      deviceId: device.id,
    });
    try {
      setStatus("Signing offline...");
      payFlowLog.info("Sign", "signing payment authorization");
      const signed = await signPaymentAuthorization({
        request: paymentRequest,
        payoutAddress,
      });
      payFlowLog.info("Sign", "signed payment ready", {
        posId: signed.posId,
        reqId: signed.reqId,
        to: signed.to,
        value: signed.value,
      });

      const json = serializeSignedPayment(signed);
      setStatus("Sending signed payment over BLE...");
      payFlowLog.info("Pay", "sending signed payment over BLE", { jsonLen: json.length });
      const transfer = await sendSignedPayment(device, json, (next) => {
        setProgress(next);
        payFlowLog.info("Transfer", "progress", next);
      });

      if (!transfer.ok) {
        setStatus(`Transfer failed: ${transfer.error}`);
        payFlowLog.error("Pay", "transfer failed", transfer.error);
        return;
      }

      const entry = await addPendingPayment(signed);
      const settlement = transfer.settlement;
      if (settlement?.status === "approved") {
        await updatePendingStatus(entry.id, "confirmed", {
          txHash: settlement.txHash,
          confirmedAt: Date.now(),
        });
        setPendingId(null);
        setStatus(
          `Payment confirmed on-chain${settlement.txHash ? `: ${settlement.txHash.slice(0, 14)}...` : "."}`
        );
        payFlowLog.info("Pay", "payment confirmed over BLE", {
          pendingId: entry.id,
          txHash: settlement.txHash ?? null,
        });
        await syncTransactions();
        return;
      }
      if (settlement?.status === "held") {
        await updatePendingStatus(entry.id, "held");
        setPendingId(null);
        setStatus(`Payment held${settlement.reason ? `: ${settlement.reason}` : "."}`);
        payFlowLog.warn("Pay", "payment held over BLE", {
          pendingId: entry.id,
          reason: settlement.reason ?? null,
        });
        await syncTransactions();
        return;
      }
      if (settlement?.status === "declined" || settlement?.status === "error") {
        await updatePendingStatus(entry.id, "declined");
        setPendingId(null);
        setStatus(`Payment declined${settlement.reason ? `: ${settlement.reason}` : "."}`);
        payFlowLog.error("Pay", "payment declined over BLE", {
          pendingId: entry.id,
          reason: settlement.reason ?? null,
          status: settlement.status,
        });
        await syncTransactions();
        return;
      }

      setPendingId(entry.id);
      setStatus("Payment pending — awaiting merchant relay.");
      payFlowLog.info("Pay", "payment queued as pending", { pendingId: entry.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment failed";
      setStatus(message);
      payFlowLog.error("Pay", "confirm pay failed", err);
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
        Scan the POS QR, confirm amount and payee, then tap pay. Status stays
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

      {!canPay && paymentRequest ? (
        <Text style={styles.warningText}>
          Pay blocked: {payBlockers.join(", ")}
          {payoutError ? ` (${payoutError})` : ""}
        </Text>
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

