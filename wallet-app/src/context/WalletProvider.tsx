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
import * as secureStorage from "../wallet/secureStorage";
import {
  getWalletFromMnemonic,
  signMessage,
  SIGN_TEST_MESSAGE,
  verifySignature,
} from "../wallet/walletService";

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
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>("loading");
  const [wallet, setWallet] = useState<HDNodeWallet | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesError, setBalancesError] = useState<string | null>(null);

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
    }
  }, [state, wallet, refreshBalances]);

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
