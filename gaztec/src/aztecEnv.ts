import {
  createLogger,
  createAztecNodeClient,
  type PXE,
  AztecNode,
  AccountWalletWithSecretKey,
  AztecAddress,
  Contract,
  Logger,
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

const logLevel = [
  "silent",
  "fatal",
  "error",
  "warn",
  "info",
  "verbose",
  "debug",
  "trace",
] as const;

type Log = {
  type: (typeof logLevel)[number];
  timestamp: number;
  prefix: string;
  message: string;
  data: any;
};

export class WebLogger {
  private static instance: WebLogger;
  private logs: Log[] = [];

  private constructor(private setLogs: (logs: Log[]) => void) {}

  static create(setLogs: (logs: Log[]) => void) {
    WebLogger.instance = new WebLogger(setLogs);
  }

  static getInstance() {
    return WebLogger.instance;
  }

  createLogger(prefix: string): Logger {
    return new Proxy(createLogger(prefix), {
      get: (target, prop, receiver) => {
        if (logLevel.includes(prop as (typeof logLevel)[number])) {
          return function () {
            const args = [prop, prefix, ...arguments] as Parameters<
              WebLogger["handleLog"]
            >;
            WebLogger.getInstance().handleLog(...args);
            target[prop].apply(this, arguments);
          };
        } else {
          return target[prop];
        }
      },
    });
  }

  private handleLog(
    type: (typeof logLevel)[number],
    prefix: string,
    message: string,
    data: any
  ) {
    this.logs.unshift({ type, prefix, message, data, timestamp: Date.now() });
    this.setLogs([...this.logs]);
  }
}

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
  logs: Log[];
  logsOpen: boolean;
  drawerOpen: boolean;
  setDrawerOpen: (drawerOpen: boolean) => void;
  setLogsOpen: (logsOpen: boolean) => void;
  setLogs: (logs: Log[]) => void;
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
  logs: [],
  logsOpen: false,
  drawerOpen: false,
  setDrawerOpen: (drawerOpen: boolean) => {},
  setLogsOpen: (logsOpen: boolean) => {},
  setLogs: (logs: Log[]) => {},
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

  static async initPXE(
    aztecNode: AztecNode,
    setLogs: (logs: Log[]) => void
  ): Promise<PXE> {
    WebLogger.create(setLogs);

    const config = getPXEServiceConfig();
    config.dataDirectory = "pxe";
    config.proverEnabled = true;

    const simulationProvider = new WASMSimulator();
    const proofCreator = new BBWASMLazyPrivateKernelProver(
      simulationProvider,
      16,
      WebLogger.getInstance().createLogger("bb:wasm:lazy")
    );
    const l1Contracts = await aztecNode.getL1ContractAddresses();
    const configWithContracts = {
      ...config,
      l1Contracts,
    } as PXEServiceConfig;

    const store = await createStore(
      "pxe_data",
      configWithContracts,
      WebLogger.getInstance().createLogger("pxe:data:indexeddb")
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
      config,
      WebLogger.getInstance().createLogger("pxe:service")
    );
    await pxe.init();
    return pxe;
  }
}
