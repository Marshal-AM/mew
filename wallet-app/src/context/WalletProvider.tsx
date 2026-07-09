import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { HDNodeWallet } from "ethers";
import { fetchAllBalances, type TokenBalance } from "../chain/balances";
import { ensureTokenAllowance } from "../chain/allowances";
import * as secureStorage from "../wallet/secureStorage";
import {
  getWalletFromMnemonic,
  signMessage,
  signTransferWithAuthorization,
  SIGN_TEST_MESSAGE,
  verifySignature,
} from "../wallet/walletService";
import { buildTransferMessage, getForwarderDomain, MOO_TOKEN_ADDRESS } from "../wallet/eip712";
import type { PaymentRequest } from "../protocol/paymentRequest";
import {
  buildSignedPaymentPayload,
  type SignedPaymentPayload,
} from "../protocol/signedPayment";
import { syncPosRegistryFromServer } from "../cache/posRegistry";
import { syncTransactionsForWallet } from "../cache/transactionSync";
import * as Network from "expo-network";
import { isSupabaseConfigured } from "../lib/supabase";
import { PAYMENT_FORWARDER } from "../chain/config";

type WalletState = "loading" | "unlocked" | "none";

type WalletContextValue = {
  state: WalletState;
  address: string | null;
  startupError: string | null;
  balances: TokenBalance[];
  balancesLoading: boolean;
  balancesError: string | null;
  refreshBalances: () => Promise<void>;
  unlockFromMnemonic: (mnemonic: string) => void;
  logout: () => Promise<void>;
  signTestMessage: () => Promise<{ signature: string; valid: boolean }>;
  signPaymentAuthorization: (params: {
    request: PaymentRequest;
    payoutAddress: string;
  }) => Promise<SignedPaymentPayload>;
  syncPosRegistry: () => Promise<void>;
  syncTransactions: () => Promise<number>;
  posRegistrySyncError: string | null;
  transactionSyncError: string | null;
  approvalStatus: string | null;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>("loading");
  const [wallet, setWallet] = useState<HDNodeWallet | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesError, setBalancesError] = useState<string | null>(null);
  const [posRegistrySyncError, setPosRegistrySyncError] = useState<string | null>(null);
  const [transactionSyncError, setTransactionSyncError] = useState<string | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);

  const address = wallet?.address ?? null;

  const refreshBalances = useCallback(async () => {
    if (!wallet) return;
    setBalancesLoading(true);
    setBalancesError(null);
    try {
      const result = await fetchAllBalances(wallet.address);
      setBalances(result);
      const allFailed = result.every((b) => b.error);
      if (allFailed) {
        setBalancesError("Could not reach Polygon Amoy. Check your connection.");
      }
    } catch (err) {
      setBalancesError(err instanceof Error ? err.message : "Failed to load balances");
    } finally {
      setBalancesLoading(false);
    }
  }, [wallet]);

  const unlockFromMnemonic = useCallback(
    (mnemonic: string) => {
      const w = getWalletFromMnemonic(mnemonic);
      setWallet(w);
      setStartupError(null);
      setState("unlocked");
    },
    []
  );

  const logout = useCallback(async () => {
    await secureStorage.deleteMnemonic();
    setWallet(null);
    setStartupError(null);
    setBalances([]);
    setBalancesError(null);
    setState("none");
  }, []);

  const signTestMessage = useCallback(async () => {
    if (!wallet) {
      throw new Error("Wallet not unlocked");
    }
    const signature = await signMessage(wallet, SIGN_TEST_MESSAGE);
    const valid = verifySignature(SIGN_TEST_MESSAGE, signature, wallet.address);
    return { signature, valid };
  }, [wallet]);

  const syncPosRegistry = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setPosRegistrySyncError(null);
      return;
    }
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected) {
      setPosRegistrySyncError("Offline — using cached POS registry.");
      return;
    }
    try {
      await syncPosRegistryFromServer();
      setPosRegistrySyncError(null);
    } catch (err) {
      setPosRegistrySyncError(err instanceof Error ? err.message : "POS registry sync failed");
    }
  }, []);

  const syncTransactions = useCallback(async () => {
    if (!wallet || !isSupabaseConfigured()) {
      setTransactionSyncError(null);
      return 0;
    }
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected) {
      setTransactionSyncError("Offline — transaction status may be stale.");
      return 0;
    }
    try {
      const count = await syncTransactionsForWallet(wallet.address);
      setTransactionSyncError(null);
      return count;
    } catch (err) {
      setTransactionSyncError(err instanceof Error ? err.message : "Transaction sync failed");
      return 0;
    }
  }, [wallet]);

  const signPaymentAuthorization = useCallback(
    async (params: {
      request: PaymentRequest;
      payoutAddress: string;
    }) => {
      if (!wallet) {
        throw new Error("Wallet not unlocked");
      }

      const message = await buildTransferMessage(
        wallet.address,
        params.payoutAddress,
        params.request
      );
      const domain = getForwarderDomain();
      const signature = await signTransferWithAuthorization(wallet, domain, message);
      return buildSignedPaymentPayload(params.request, message, signature);
    },
    [wallet]
  );

  const ensurePaymentApproval = useCallback(async () => {
    if (!wallet) return;
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected) {
      setApprovalStatus("Offline - approval check skipped.");
      return;
    }
    try {
      const result = await ensureTokenAllowance(wallet, MOO_TOKEN_ADDRESS, PAYMENT_FORWARDER, 1n);
      if (result.approved) {
        const message = `Approved MOO for forwarder (${result.txHash?.slice(0, 14)}...).`;
        console.log(`[MooWallet] ${message}`);
        setApprovalStatus(message);
      } else {
        const message = "MOO forwarder approval already present.";
        console.log(`[MooWallet] ${message}`);
        setApprovalStatus(message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Approval check failed";
      console.error("[MooWallet] approval failed", message);
      setApprovalStatus(`Approval failed: ${message}`);
    }
  }, [wallet]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        console.log("[MooWallet] startup: checking secure storage");
        const exists = await secureStorage.hasWallet();
        if (cancelled) return;
        console.log(`[MooWallet] startup: wallet exists=${String(exists)}`);
        if (!exists) {
          setState("none");
          return;
        }
        const mnemonic = await secureStorage.loadMnemonic();
        if (cancelled) return;
        console.log("[MooWallet] startup: mnemonic loaded successfully");
        unlockFromMnemonic(mnemonic);
      } catch (err) {
        console.error(
          "[MooWallet] startup failed",
          err instanceof Error ? err.message : String(err),
          err instanceof Error && err.stack ? err.stack : "no stack"
        );
        if (!cancelled) {
          setStartupError("Wallet startup failed. Please restart the app or reset local wallet data.");
          setState("none");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unlockFromMnemonic]);

  useEffect(() => {
    if (state === "unlocked" && wallet) {
      console.log(`[MooWallet] refresh balances for ${wallet.address}`);
      refreshBalances();
      void syncPosRegistry();
      void syncTransactions();
      void ensurePaymentApproval();
    }
  }, [state, wallet, refreshBalances, syncPosRegistry, syncTransactions, ensurePaymentApproval]);

  const value = useMemo(
    () => ({
      state,
      address,
      startupError,
      balances,
      balancesLoading,
      balancesError,
      refreshBalances,
      unlockFromMnemonic,
      logout,
      signTestMessage,
      signPaymentAuthorization,
      syncPosRegistry,
      syncTransactions,
      posRegistrySyncError,
      transactionSyncError,
      approvalStatus,
    }),
    [
      state,
      address,
      startupError,
      balances,
      balancesLoading,
      balancesError,
      refreshBalances,
      unlockFromMnemonic,
      logout,
      signTestMessage,
      signPaymentAuthorization,
      syncPosRegistry,
      syncTransactions,
      posRegistrySyncError,
      transactionSyncError,
      approvalStatus,
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within WalletProvider");
  }
  return ctx;
}
