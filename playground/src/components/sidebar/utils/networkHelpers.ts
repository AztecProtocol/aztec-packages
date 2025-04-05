import { AztecEnv, WebLogger } from '../../../aztecEnv';
import { createStore } from '@aztec/kv-store/indexeddb';
import { NetworkDB, WalletDB } from '../../../utils/storage';
import type { PXE } from '@aztec/aztec.js';
import { parseAliasedBuffersAsString } from './accountHelpers';
import { NETWORKS } from '../constants';
import type { Network } from '../types';

// Custom error class for network connection issues
export class NetworkConnectionError extends Error {
  constructor(message: string, public nodeUrl: string) {
    super(message);
    this.name = 'NetworkConnectionError';
  }
}

/**
 * Connects to the specified Aztec network
 */
export async function connectToNetwork(
  nodeUrl: string,
  setNodeURL: (url: string) => void,
  setPXEInitialized: (initialized: boolean) => void,
  setAztecNode: (node: any) => void,
  setPXE: (pxe: PXE) => void,
  setWalletDB: (walletDB: WalletDB) => void,
  setLogs: (logs: any) => void
) {
  try {
    setPXEInitialized(false);
    setNodeURL(nodeUrl);
    
    // Attempt to connect to the node
    let node;
    try {
      node = await AztecEnv.connectToNode(nodeUrl);
    } catch (error) {
      console.error('Failed to connect to node:', error);
      throw new NetworkConnectionError(
        error.message || 'Failed to connect to Aztec node',
        nodeUrl
      );
    }
    
    setAztecNode(node);
    
    // Attempt to initialize PXE
    let pxe;
    try {
      pxe = await AztecEnv.initPXE(node, setLogs);
    } catch (error) {
      console.error('Failed to initialize PXE:', error);
      throw new NetworkConnectionError(
        error.message || 'Failed to initialize PXE service',
        nodeUrl
      );
    }
    
    // Get rollup address
    let rollupAddress;
    try {
      rollupAddress = (await pxe.getNodeInfo()).l1ContractAddresses.rollupAddress;
    } catch (error) {
      console.error('Failed to get node info:', error);
      throw new NetworkConnectionError(
        error.message || 'Failed to retrieve network information',
        nodeUrl
      );
    }
    
    // Initialize wallet database
    try {
      const walletLogger = WebLogger.getInstance().createLogger('wallet:data:idb');
      const walletDBStore = await createStore(
        `wallet-${rollupAddress}`,
        { dataDirectory: 'wallet', dataStoreMapSizeKB: 2e10 },
        walletLogger,
      );
      const walletDB = WalletDB.getInstance();
      walletDB.init(walletDBStore, walletLogger.info);
      setPXE(pxe);
      setWalletDB(walletDB);
      setPXEInitialized(true);
      return { pxe, walletDB };
    } catch (error) {
      console.error('Failed to initialize wallet database:', error);
      throw new NetworkConnectionError(
        error.message || 'Failed to initialize wallet storage',
        nodeUrl
      );
    }
  } catch (error) {
    // Reset network URL since connection failed
    setNodeURL('');
    if (error instanceof NetworkConnectionError) {
      throw error;
    }
    throw new NetworkConnectionError('Failed to connect to network', nodeUrl);
  }
}

/**
 * Loads available networks (predefined + custom)
 */
export async function loadNetworks(): Promise<Network[]> {
  try {
    const aliasedBuffers = await NetworkDB.getInstance().listNetworks();
    const aliasedNetworks = parseAliasedBuffersAsString(aliasedBuffers);
    return [
      ...NETWORKS,
      ...aliasedNetworks.map(network => ({
        nodeURL: network.value,
        name: network.key,
        description: 'Custom network'
      })),
    ];
  } catch (error) {
    console.error('Error loading networks:', error);
    return NETWORKS;
  }
}

/**
 * Adds a new network to the storage
 */
export async function addNetwork(alias: string, networkUrl: string): Promise<void> {
  await NetworkDB.getInstance().storeNetwork(alias, networkUrl);
} 