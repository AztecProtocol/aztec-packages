import {
  type AztecNode,
  AztecAddress,
  AccountWalletWithSecretKey,
  type ContractArtifact,
  createAztecNodeClient,
  WalletDiscoveryService, type WalletWithMetadata
} from '@aztec/aztec.js';

import { createStore } from '@aztec/kv-store/indexeddb';
import { createContext } from 'react';
import { type UserTx } from './utils/txs';
import type { Network } from './utils/networks';
import type { Log } from './utils/types';
import { AppDB } from './app_db';
import { WebLogger } from './utils/web_logger';


export const AztecContext = createContext<{
  connecting: boolean;
  network: Network;
  node: AztecNode;
  wallet: AccountWalletWithSecretKey | null;
  appDB: AppDB;
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
  setWallet: (wallet: AccountWalletWithSecretKey) => void;
  setAztecNode: (node: AztecNode) => void;
  setNetwork: (network: Network) => void;
  setCurrentTx: (currentTx: UserTx) => void;
  setCurrentContractArtifact: (currentContract: ContractArtifact) => void;
  setCurrentContractAddress: (currentContractAddress: AztecAddress) => void;
  setDefaultContractCreationParams: (defaultContractCreationParams: Record<string, unknown>) => void;
  setPendingTxUpdateCounter: (pendingTxUpdateCounter: number) => void;
  setIsNetworkCongested: (isNetworkCongested: boolean) => void;
}>({
  connecting: false,
  network: null,
  node: null,
  wallet: null,
  appDB: null,
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
  setWallet: () => {},
  setNetwork: () => {},
  setAztecNode: () => {},
  setCurrentTx: () => {},
  setCurrentContractArtifact: () => {},
  setCurrentContractAddress: () => {},
  setDefaultContractCreationParams: () => {},
  setPendingTxUpdateCounter: () => {},
  setIsNetworkCongested: () => {},
});

export class AztecEnv {
  static isAppStoreInitialized = false;

  static async initAppStore() {
    if (!AztecEnv.isAppStoreInitialized) {
      AztecEnv.isAppStoreInitialized = true;
      const appStore = await createStore('playground_data', {
        dataDirectory: 'playground',
        dataStoreMapSizeKB: 1e6,
      });
      await AppDB.getInstance().init(appStore, WebLogger.getInstance().createLogger('app:idb').verbose);
    }
  }

  static requestWallets(): WalletWithMetadata[] {
    return WalletDiscoveryService.getInstance().wallets
  }

  static async connectToNode(nodeURL: string): Promise<AztecNode> {
    const aztecNode = await createAztecNodeClient(nodeURL);
    return aztecNode;
  }
}
