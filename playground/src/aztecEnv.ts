import {
  createAztecNodeClient,
  type AztecNode,
  AztecAddress,
  AccountWalletWithSecretKey,
  Contract,
  type PXE,
  type Logger,
  createLogger,
} from '@aztec/aztec.js';

import { createPXEService, type PXEServiceConfig, getPXEServiceConfig } from '@aztec/pxe/client/lazy';
import { createStore } from '@aztec/kv-store/indexeddb';
import { createContext } from 'react';
import { NetworkDB, WalletDB } from './utils/storage';
import { type ContractFunctionInteractionTx } from './utils/txs';

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
  private static readonly MAX_LOGS_TO_KEEP = 200;

  private constructor() {}

  static create(setLogs: (logs: Log[]) => void) {
    if (!WebLogger.instance) {
      WebLogger.instance = new WebLogger();
      setInterval(() => {
        const instance = WebLogger.getInstance();
        const newLogs = instance.logs.slice(0, WebLogger.MAX_LOGS_TO_KEEP).sort((a, b) => b.timestamp - a.timestamp);
        setLogs(newLogs);
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
    this.logs.unshift({ id: this.randomId(), type, prefix, message, data, timestamp: Date.now() });
  }

  private randomId(): string {
    const uint32 = window.crypto.getRandomValues(new Uint32Array(1))[0];
    return uint32.toString(16);
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
  nodeURL: '',
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
  setDrawerOpen: () => {},
  setLogsOpen: () => {},
  setLogs: () => {},
  setWalletDB: () => {},
  setPXEInitialized: () => {},
  setWallet: () => {},
  setNodeURL: () => {},
  setPXE: () => {},
  setAztecNode: () => {},
  setCurrentTx: () => {},
  setCurrentContract: () => {},
  setCurrentContractAddress: () => {},
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

  static async initPXE(aztecNode: AztecNode, setLogs: (logs: Log[]) => void): Promise<PXE> {
    WebLogger.create(setLogs);

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
        store: WebLogger.getInstance().createLogger('pxe:data:indexeddb'),
        pxe: WebLogger.getInstance().createLogger('pxe:service'),
        prover: WebLogger.getInstance().createLogger('bb:wasm:lazy'),
      },
    });
    return pxe;
  }
}
