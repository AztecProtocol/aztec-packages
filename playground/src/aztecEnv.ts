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

type Log = {
  type: (typeof logLevel)[number];
  timestamp: number;
  prefix: string;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      get: (target, prop) => {
        if (logLevel.includes(prop as (typeof logLevel)[number])) {
          return function () {
            // eslint-disable-next-line prefer-rest-params
            const args = [prop, prefix, ...arguments] as Parameters<WebLogger['handleLog']>;
            WebLogger.getInstance().handleLog(...args);
            // eslint-disable-next-line prefer-rest-params
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any,
  ) {
    // More comprehensive filtering of noisy block update logs
    if (
      // Filter PXE block update logs
      (prefix === 'pxe:service' &&
       (message.includes('Updated pxe last block') ||
        message.includes('archive:') ||
        message.includes('blockHash:') ||
        (typeof data === 'object' && data && 'blockHash' in data))) ||
      // Filter block stream logs
      (prefix === 'pxe:block_stream') ||
      // Filter other noisy logs that don't provide value
      (message.includes('Simulating transaction execution request'))
    ) {
      return; // Skip these logs
    }

    this.logs.unshift({ type, prefix, message, data, timestamp: Date.now() });
    this.setLogs([...this.logs]);
  }
}

// Add a global console log filter
// This will help filter out the noisy logs that are directly logged to console
// and not going through our logger
const originalConsoleLog = console.log;
console.log = function(...args) {
  // More comprehensive filtering for block updates
  if (args.length > 0) {
    // Filter messages about block updates directly
    if (typeof args[0] === 'string' &&
        (args[0].includes('Updated pxe last block') ||
         args[0].includes('blockHash'))) {
      return;
    }

    // Filter object-based log messages about block updates
    if (args.length >= 2 &&
        typeof args[0] === 'object' && args[0] &&
        typeof args[0].module === 'string' && args[0].module === 'pxe:service') {

      // Check for blockHash in second argument
      if (typeof args[1] === 'object' && args[1] &&
          (args[1].blockHash !== undefined || args[1].archive !== undefined)) {
        return;
      }

      // Check for block update text in third argument
      if (args.length >= 3 && typeof args[2] === 'string' &&
          (args[2].includes('Updated pxe last block') ||
           args[2].includes('block to '))) {
        return;
      }
    }
  }

  // Let all other logs pass through
  originalConsoleLog.apply(console, args);
};

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
  selectedPredefinedContract: string;
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
  setSelectedPredefinedContract: (contract: string) => void;
  setShowContractInterface: (show: boolean) => void;
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
  selectedPredefinedContract: '',
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
  setSelectedPredefinedContract: () => {},
  setShowContractInterface: () => {},
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
