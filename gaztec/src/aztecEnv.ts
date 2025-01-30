import {
  createLogger,
  createAztecNodeClient,
  type PXE,
  AztecNode,
  AccountWalletWithSecretKey,
  AztecAddress,
  Contract,
} from "@aztec/aztec.js";
import { PXEService } from "@aztec/pxe/service";
import { PXEServiceConfig, getPXEServiceConfig } from "@aztec/pxe/config";
import { KVPxeDatabase } from "@aztec/pxe/database";
import { KeyStore } from "@aztec/key-store";
import { L2TipsStore } from "@aztec/kv-store/stores";
import { createStore } from "@aztec/kv-store/indexeddb";
import { BBWASMLazyPrivateKernelProver } from "@aztec/bb-prover/wasm/lazy";
import { WASMSimulator } from "@aztec/simulator/client";
import { debug } from "debug";
import { createContext } from "react";
import { WalletDB } from "./utils/storage";
import { ContractFunctionInteractionTx } from "./utils/txs";

process.env = Object.keys(import.meta.env).reduce((acc, key) => {
  acc[key.replace("VITE_", "")] = import.meta.env[key];
  return acc;
}, {});

debug.enable("*");

export const AztecContext = createContext<{
  pxe: PXE | null;
  nodeURL: string;
  node: AztecNode;
  wallet: AccountWalletWithSecretKey | null;
  isPXEInitialized: boolean;
  walletDB: WalletDB | null;
  currentContractAddress: AztecAddress;
  currentContract: Contract;
  currentTx: ContractFunctionInteractionTx;
  setWalletDB: (walletDB: WalletDB) => void;
  setPXEInitialized: (isPXEInitialized: boolean) => void;
  setWallet: (wallet: AccountWalletWithSecretKey) => void;
  setAztecNode: (node: AztecNode) => void;
  setPXE: (pxe: PXE) => void;
  setNodeURL: (nodeURL: string) => void;
  setCurrentTx: (currentTx: ContractFunctionInteractionTx) => void;
  setCurrentContract: (currentContract: Contract) => void;
  setCurrentContractAddress: (currentContractAddress: AztecAddress) => void;
}>({
  pxe: null,
  nodeURL: "",
  node: null,
  wallet: null,
  isPXEInitialized: false,
  walletDB: null,
  currentContract: null,
  currentContractAddress: null,
  currentTx: null,
  setWalletDB: (walletDB: WalletDB) => {},
  setPXEInitialized: (isPXEInitialized: boolean) => {},
  setWallet: (wallet: AccountWalletWithSecretKey) => {},
  setNodeURL: (nodeURL: string) => {},
  setPXE: (pxe: PXE) => {},
  setAztecNode: (node: AztecNode) => {},
  setCurrentTx: (currentTx: ContractFunctionInteractionTx) => {},
  setCurrentContract: (currentContract: Contract) => {},
  setCurrentContractAddress: (currentContractAddress: AztecAddress) => {},
});

export class AztecEnv {
  static async connectToNode(nodeURL: string): Promise<AztecNode> {
    const aztecNode = await createAztecNodeClient(nodeURL);
    return aztecNode;
  }

  static async initPXE(aztecNode: AztecNode): Promise<PXE> {
    const config = getPXEServiceConfig();
    config.dataDirectory = "pxe";
    config.proverEnabled = true;

    const simulationProvider = new WASMSimulator();
    const proofCreator = new BBWASMLazyPrivateKernelProver(
      simulationProvider,
      16
    );
    const l1Contracts = await aztecNode.getL1ContractAddresses();
    const configWithContracts = {
      ...config,
      l1Contracts,
    } as PXEServiceConfig;

    const store = await createStore(
      "pxe_data",
      configWithContracts,
      createLogger("pxe:data:indexeddb")
    );

    const keyStore = new KeyStore(store);

    const db = await KVPxeDatabase.create(store);
    const tips = new L2TipsStore(store, "pxe");

    const pxe = new PXEService(
      keyStore,
      aztecNode,
      db,
      tips,
      proofCreator,
      simulationProvider,
      config
    );
    await pxe.init();
    return pxe;
  }
}
