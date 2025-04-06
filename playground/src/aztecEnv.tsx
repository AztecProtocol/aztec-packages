import React, { useEffect, createContext, useState } from 'react';
import { AccountWalletWithSecretKey, AztecAddress, Fr, PXE } from '@aztec/aztec.js';
import { WalletDB } from './utils/storage';
import { AztecNode } from '@aztec/aztec.js';

// Create the Aztec context
export const AztecContext = createContext({
  pxe: null,
  nodeURL: '',
  logs: [],
  wallet: undefined,
  walletDB: undefined,
  isPXEInitialized: false,
  currentContractAddress: null,
  currentContract: null,
  selectedPredefinedContract: '',
  currentTx: null,
  showContractInterface: false,
  isWorking: false,
  setShowContractInterface: (show: boolean) => {},
  setPXE: (pxe: PXE | null) => {},
  setNodeURL: (url: string) => {},
  setLogs: (logs: string[]) => {},
  setPXEInitialized: (initialized: boolean) => {},
  setWallet: (wallet: AccountWalletWithSecretKey | undefined) => {},
  setWalletDB: (db: WalletDB | undefined) => {},
  setAztecNode: (node: AztecNode | undefined) => {},
  setCurrentContractAddress: (address: AztecAddress | null) => {},
  setCurrentContract: (contract: any) => {},
  setDrawerOpen: (open: boolean) => {},
  setLogsOpen: (open: boolean) => {},
  setSelectedPredefinedContract: (contract: string) => {},
  setCurrentTx: (tx: any) => {},
  setIsWorking: (working: boolean) => {},
});

// Provider component to wrap the app with the Aztec context
export const AztecProvider = ({ children }) => {
  const [pxe, setPXE] = useState(null);
  const [nodeURL, setNodeURL] = useState('');
  const [logs, setLogs] = useState([]);
  const [wallet, setWallet] = useState(undefined);
  const [walletDB, setWalletDB] = useState(undefined);
  const [aztecNode, setAztecNode] = useState(undefined);
  const [isPXEInitialized, setPXEInitialized] = useState(false);
  const [currentContractAddress, setCurrentContractAddress] = useState(null);
  const [currentContract, setCurrentContract] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [selectedPredefinedContract, setSelectedPredefinedContract] = useState('');
  const [currentTx, setCurrentTx] = useState(null);
  const [showContractInterface, setShowContractInterface] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  // Filter out noisy PXE block update logs
  useEffect(() => {
    const originalConsoleLog = console.log;
    console.log = function(...args) {
      // Filter out "Updated pxe last block" messages
      if (
        args.length > 0 &&
        typeof args[0] === 'object' &&
        args[0] !== null &&
        args[0].module === 'pxe:service' &&
        args.length > 1 &&
        typeof args[1] === 'string' &&
        args[1].includes('Updated pxe last block')
      ) {
        // Skip this log
        return;
      }
      originalConsoleLog.apply(console, args);
    };

    // Clean up on unmount
    return () => {
      console.log = originalConsoleLog;
    };
  }, []);

  return (
    <AztecContext.Provider
      value={{
        pxe,
        nodeURL,
        logs,
        wallet,
        walletDB,
        isPXEInitialized,
        currentContractAddress,
        currentContract,
        selectedPredefinedContract,
        currentTx,
        showContractInterface,
        isWorking,
        setShowContractInterface,
        setPXE,
        setNodeURL,
        setLogs,
        setPXEInitialized,
        setWallet,
        setWalletDB,
        setAztecNode,
        setCurrentContractAddress,
        setCurrentContract,
        setDrawerOpen,
        setLogsOpen,
        setSelectedPredefinedContract,
        setCurrentTx,
        setIsWorking,
      }}
    >
      {children}
    </AztecContext.Provider>
  );
};
