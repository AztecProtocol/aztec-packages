import { css } from "@emotion/react";
import { ContractComponent } from "../contract/contract";
import { SidebarComponent } from "../sidebar/sidebar";
import { createContext, useState } from "react";
import { type PXE, type AccountWalletWithSecretKey } from "@aztec/aztec.js";
import { type WalletDB } from "../../utils/storage";

const layout = css({
  display: "flex",
  flexDirection: "row",
  height: "100%",
});

export const PrivateContext = createContext<{
  pxe: PXE | null;
  nodeURL: string;
  wallet: AccountWalletWithSecretKey | null;
  isPXEInitialized: boolean;
  walletDB: WalletDB | null;
  setWalletDB: (walletDB: WalletDB) => void;
  setPXEInitialized: (isPXEInitialized: boolean) => void;
  setWallet: (wallet: AccountWalletWithSecretKey) => void;
  setPXE: (pxe: PXE) => void;
  setNodeURL: (nodeURL: string) => void;
}>({
  pxe: null,
  nodeURL: "",
  wallet: null,
  isPXEInitialized: false,
  walletDB: null,
  setWalletDB: (walletDB: WalletDB) => {},
  setPXEInitialized: (isPXEInitialized: boolean) => {},
  setWallet: (wallet: AccountWalletWithSecretKey) => {},
  setNodeURL: (nodeURL: string) => {},
  setPXE: (pxe: PXE) => {},
});

export function Home() {
  const [pxe, setPXE] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [nodeURL, setNodeURL] = useState("");
  const [isPXEInitialized, setPXEInitialized] = useState(false);
  const [walletAlias, setWalletAlias] = useState("");
  const [walletDB, setWalletDB] = useState(null);

  const privateContextInitialValue = {
    pxe,
    nodeURL,
    wallet,
    isPXEInitialized,
    walletAlias,
    walletDB,
    setWalletDB,
    setPXEInitialized,
    setWallet,
    setPXE,
    setNodeURL,
    setWalletAlias,
  };

  return (
    <div css={layout}>
      <PrivateContext.Provider value={privateContextInitialValue}>
        <SidebarComponent />
        <ContractComponent />
      </PrivateContext.Provider>
    </div>
  );
}
