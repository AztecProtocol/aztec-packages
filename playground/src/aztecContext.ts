import { AztecAddress, type AztecNode, type ContractArtifact, type Wallet } from '@aztec/aztec.js';

import { createContext } from 'react';
import { type UserTx } from './utils/txs';
import type { Network } from './utils/networks';
import { PlaygroundDB } from './utils/storage';
import { type Log } from './utils/web_logger';

export const AztecContext = createContext<{
  network: Network;
  node: AztecNode;
  wallet: Wallet | null;
  playgroundDB: PlaygroundDB;
  from: AztecAddress;
  currentContractAddress: AztecAddress;
  currentTx: UserTx;
  showContractInterface: boolean;
  currentContractArtifact: ContractArtifact;
  defaultContractCreationParams: Record<string, unknown>;
  pendingTxUpdateCounter: number;
  isNetworkCongested: boolean;
  logs: Log[];
  totalLogCount: number;
  logsOpen: boolean;
  embeddedWalletSelected: boolean;
  setIsEmbeddedWalletSelected: (selected: boolean) => void;
  setLogsOpen: (open: boolean) => void;
  setLogs: (logs: Log[]) => void;
  setTotalLogCount: (count: number) => void;
  setShowContractInterface: (showContractInterface: boolean) => void;
  setNode: (node: AztecNode) => void;
  setWallet: (wallet: Wallet) => void;
  setPlaygroundDB: (playgroundDB: PlaygroundDB) => void;
  setFrom: (address: AztecAddress) => void;
  setNetwork: (network: Network) => void;
  setCurrentTx: (currentTx: UserTx) => void;
  setCurrentContractArtifact: (currentContract: ContractArtifact) => void;
  setCurrentContractAddress: (currentContractAddress: AztecAddress) => void;
  setDefaultContractCreationParams: (defaultContractCreationParams: Record<string, unknown>) => void;
  setPendingTxUpdateCounter: (pendingTxUpdateCounter: number) => void;
  setIsNetworkCongested: (isNetworkCongested: boolean) => void;
}>({
  network: null,
  node: null,
  wallet: null,
  playgroundDB: null,
  from: null,
  currentContractArtifact: null,
  currentContractAddress: null,
  currentTx: null,
  showContractInterface: false,
  defaultContractCreationParams: {},
  pendingTxUpdateCounter: 0,
  isNetworkCongested: false,
  totalLogCount: 0,
  logs: [],
  logsOpen: false,
  embeddedWalletSelected: false,
  setIsEmbeddedWalletSelected: () => {},
  setLogsOpen: () => {},
  setLogs: () => {},
  setTotalLogCount: () => {},
  setShowContractInterface: () => {},
  setWallet: () => {},
  setNode: () => {},
  setPlaygroundDB: () => {},
  setFrom: () => {},
  setNetwork: () => {},
  setCurrentTx: () => {},
  setCurrentContractArtifact: () => {},
  setCurrentContractAddress: () => {},
  setDefaultContractCreationParams: () => {},
  setPendingTxUpdateCounter: () => {},
  setIsNetworkCongested: () => {},
});
