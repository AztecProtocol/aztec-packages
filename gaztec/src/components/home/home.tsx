import { css } from "@emotion/react";
import { ContractComponent } from "../contract/contract";
import { SidebarComponent } from "../sidebar/sidebar";
import { createContext, useState } from "react";
import {
  type PXE,
  type AccountWalletWithSecretKey,
  Contract,
} from "@aztec/aztec.js";
import { type WalletDB } from "../../utils/storage";
import { ContractFunctionInteractionTx } from "../../utils/txs";

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
  currentContract: Contract;
  currentTx: ContractFunctionInteractionTx;
  setWalletDB: (walletDB: WalletDB) => void;
  setPXEInitialized: (isPXEInitialized: boolean) => void;
  setWallet: (wallet: AccountWalletWithSecretKey) => void;
  setPXE: (pxe: PXE) => void;
  setNodeURL: (nodeURL: string) => void;
  setCurrentTx: (currentTx: ContractFunctionInteractionTx) => void;
  setCurrentContract: (currentContract: Contract) => void;
}>({
  pxe: null,
  nodeURL: "",
  wallet: null,
  isPXEInitialized: false,
  walletDB: null,
  currentContract: null,
  currentTx: null,
  setWalletDB: (walletDB: WalletDB) => {},
  setPXEInitialized: (isPXEInitialized: boolean) => {},
  setWallet: (wallet: AccountWalletWithSecretKey) => {},
  setNodeURL: (nodeURL: string) => {},
  setPXE: (pxe: PXE) => {},
  setCurrentTx: (currentTx: ContractFunctionInteractionTx) => {},
  setCurrentContract: (currentContract: Contract) => {},
});

export function Home() {
  const [pxe, setPXE] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [nodeURL, setNodeURL] = useState("");
  const [isPXEInitialized, setPXEInitialized] = useState(false);
  const [walletAlias, setWalletAlias] = useState("");
  const [walletDB, setWalletDB] = useState(null);
  const [currentContract, setCurrentContract] = useState(null);
  const [currentTx, setCurrentTx] = useState(null);

  const privateContextInitialValue = {
    pxe,
    nodeURL,
    wallet,
    isPXEInitialized,
    walletAlias,
    walletDB,
    currentContract,
    currentTx,
    setCurrentTx,
    setWalletDB,
    setPXEInitialized,
    setWallet,
    setPXE,
    setNodeURL,
    setWalletAlias,
    setCurrentContract,
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
