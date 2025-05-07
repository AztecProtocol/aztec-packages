import {
  createAztecNodeClient,
  type AztecNode,
  AztecAddress,
  AccountWalletWithSecretKey,
  type PXE,
  type Logger,
  createLogger,
  type ContractArtifact,
} from '@aztec/aztec.js';

import { createPXEService, type PXEServiceConfig, getPXEServiceConfig } from '@aztec/pxe/client/lazy';
import { createStore } from '@aztec/kv-store/indexeddb';
import { createContext } from 'react';
import { NetworkDB, WalletDB } from './utils/storage';
import { type UserTx } from './utils/txs';
import type { Network } from './utils/networks';

const logLevel = ['silent', 'fatal', 'error', 'warn', 'info', 'verbose', 'debug', 'trace'] as const;
type LogLevel = (typeof logLevel)[number];

type Log = {
  id: string;
  type: LogLevel;
  timestamp: number;
  prefix: string;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
};

export class WebLogger {
  private static instance: WebLogger;
  private logs: Log[] = [];

  private static updateIntervalMs = 1000;
  private static readonly MAX_LOGS_TO_KEEP = 1000;

  public totalLogCount = 0;

  private constructor() {}

  static create(setLogs: (logs: Log[]) => void, setTotalLogCount: (count: number) => void) {
    if (!WebLogger.instance) {
      WebLogger.instance = new WebLogger();
      setInterval(() => {
        const instance = WebLogger.getInstance();
        const newLogs = instance.logs.slice(0, WebLogger.MAX_LOGS_TO_KEEP).sort((a, b) => b.timestamp - a.timestamp);
        setLogs(newLogs);
        setTotalLogCount(instance.totalLogCount);
      }, WebLogger.updateIntervalMs);
    }
  }

  static getInstance() {
    return WebLogger.instance;
  }

  createLogger(prefix: string): Logger {
    return new Proxy(createLogger(prefix), {
      get: (target, prop) => {
        if (logLevel.includes(prop as (typeof logLevel)[number])) {
          return function (this: Logger, ...data: Parameters<Logger[LogLevel]>) {
            const loggingFn = prop as LogLevel;
            const args = [loggingFn, prefix, ...data] as Parameters<WebLogger['handleLog']>;
            WebLogger.getInstance().handleLog(...args);
            target[loggingFn].call(this, ...[data[0], data[1]]);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any,
  ) {
    this.totalLogCount++;
    this.logs.unshift({ id: this.randomId(), type, prefix, message, data, timestamp: Date.now() });
  }

  private randomId(): string {
    const uint32 = window.crypto.getRandomValues(new Uint32Array(1))[0];
    return uint32.toString(16);
  }
}

export const AztecContext = createContext<{
  pxe: PXE | null;
  connecting: boolean;
  network: Network;
  node: AztecNode;
  wallet: AccountWalletWithSecretKey | null;
  isPXEInitialized: boolean;
  walletDB: WalletDB | null;
  currentContractAddress: AztecAddress;
  currentTx: UserTx;
  logs: Log[];
  logsOpen: boolean;
  showContractInterface: boolean;
  currentContractArtifact: ContractArtifact;
  totalLogCount: number;
  defaultContractCreationParams: Record<string, unknown>;
  pendingTxUpdateCounter: number;
  isNetworkCongested: boolean;
  setTotalLogCount: (count: number) => void;
  setShowContractInterface: (showContractInterface: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setLogsOpen: (logsOpen: boolean) => void;
  setLogs: (logs: Log[]) => void;
  setWalletDB: (walletDB: WalletDB) => void;
  setPXEInitialized: (isPXEInitialized: boolean) => void;
  setWallet: (wallet: AccountWalletWithSecretKey) => void;
  setAztecNode: (node: AztecNode) => void;
  setPXE: (pxe: PXE) => void;
  setNetwork: (network: Network) => void;
  setCurrentTx: (currentTx: UserTx) => void;
  setCurrentContractArtifact: (currentContract: ContractArtifact) => void;
  setCurrentContractAddress: (currentContractAddress: AztecAddress) => void;
  setDefaultContractCreationParams: (defaultContractCreationParams: Record<string, unknown>) => void;
  setPendingTxUpdateCounter: (pendingTxUpdateCounter: number) => void;
  setIsNetworkCongested: (isNetworkCongested: boolean) => void;
}>({
  pxe: null,
  connecting: false,
  network: null,
  node: null,
  wallet: null,
  isPXEInitialized: false,
  walletDB: null,
  currentContractArtifact: null,
  currentContractAddress: null,
  currentTx: null,
  logs: [],
  totalLogCount: 0,
  logsOpen: false,
  showContractInterface: false,
  defaultContractCreationParams: {},
  pendingTxUpdateCounter: 0,
  isNetworkCongested: false,
  setTotalLogCount: () => {},
  setShowContractInterface: () => {},
  setConnecting: () => {},
  setLogsOpen: () => {},
  setLogs: () => {},
  setWalletDB: () => {},
  setPXEInitialized: () => {},
  setWallet: () => {},
  setNetwork: () => {},
  setPXE: () => {},
  setAztecNode: () => {},
  setCurrentTx: () => {},
  setCurrentContractArtifact: () => {},
  setCurrentContractAddress: () => {},
  setDefaultContractCreationParams: () => {},
  setPendingTxUpdateCounter: () => {},
  setIsNetworkCongested: () => {},
});

export class AztecEnv {
  static isNetworkStoreInitialized = false;

  static async initNetworkStore() {
    if (!AztecEnv.isNetworkStoreInitialized) {
      AztecEnv.isNetworkStoreInitialized = true;
      const networkStore = await createStore('network_data', {
        dataDirectory: 'network',
        dataStoreMapSizeKB: 1e6,
      });
      const networkDB = NetworkDB.getInstance();
      networkDB.init(networkStore);
    }
  }

  static async connectToNode(nodeURL: string): Promise<AztecNode> {
    const aztecNode = await createAztecNodeClient(nodeURL);
    return aztecNode;
  }

  static async initPXE(
    aztecNode: AztecNode,
    setLogs: (logs: Log[]) => void,
    setTotalLogCount: (count: number) => void,
  ): Promise<PXE> {
    WebLogger.create(setLogs, setTotalLogCount);

    const config = getPXEServiceConfig();
    config.dataDirectory = 'pxe';
    config.proverEnabled = true;
    const l1Contracts = await aztecNode.getL1ContractAddresses();
    const configWithContracts = {
      ...config,
      l1Contracts,
    } as PXEServiceConfig;

    const pxe = await createPXEService(aztecNode, configWithContracts, {
      loggers: {
        store: WebLogger.getInstance().createLogger('pxe:data:idb'),
        pxe: WebLogger.getInstance().createLogger('pxe:service'),
        prover: WebLogger.getInstance().createLogger('bb:wasm:lazy'),
      },
    });
    return pxe;
  }
}
