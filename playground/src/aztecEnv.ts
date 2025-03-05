import { createAztecNodeClient, type AztecNode } from '@aztec/aztec.js/utils';

import { AztecAddress } from '@aztec/aztec.js/addresses';
import { AccountWalletWithSecretKey } from '@aztec/aztec.js/wallet';
import { Contract } from '@aztec/aztec.js/contracts';
import { type PXE } from '@aztec/aztec.js/interfaces/pxe';
import { PXEService } from '@aztec/pxe/service';
import { type PXEServiceConfig, getPXEServiceConfig } from '@aztec/pxe/config';
import { KVPxeDatabase } from '@aztec/pxe/database';
import { KeyStore } from '@aztec/key-store';
import { L2TipsStore } from '@aztec/kv-store/stores';
import { createStore } from '@aztec/kv-store/indexeddb';
import { BBWASMLazyPrivateKernelProver } from '@aztec/bb-prover/wasm/lazy';
import { WASMSimulator } from '@aztec/simulator/client';
import { createContext } from 'react';
import { NetworkDB, WalletDB } from './utils/storage';
import { type ContractFunctionInteractionTx } from './utils/txs';
import { type Logger, createLogger } from '@aztec/aztec.js/log';
import { LazyProtocolContractsProvider } from '@aztec/protocol-contracts/providers/lazy';

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

    const simulationProvider = new WASMSimulator();
    const proofCreator = new BBWASMLazyPrivateKernelProver(
      simulationProvider,
      16,
      WebLogger.getInstance().createLogger('bb:wasm:lazy'),
    );
    const l1Contracts = await aztecNode.getL1ContractAddresses();
    const configWithContracts = {
      ...config,
      l1Contracts,
    } as PXEServiceConfig;

    const store = await createStore(
      'pxe_data',
      configWithContracts,
      WebLogger.getInstance().createLogger('pxe:data:indexeddb'),
    );

    const keyStore = new KeyStore(store);

    const db = await KVPxeDatabase.create(store);
    const tips = new L2TipsStore(store, 'pxe');

    const protocolContractsProvider = new LazyProtocolContractsProvider();

    const pxe = new PXEService(
      keyStore,
      aztecNode,
      db,
      tips,
      proofCreator,
      simulationProvider,
      protocolContractsProvider,
      config,
      WebLogger.getInstance().createLogger('pxe:service'),
    );
    await pxe.init();
    return pxe;
  }
}
