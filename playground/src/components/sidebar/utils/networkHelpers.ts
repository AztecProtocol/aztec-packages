import { AztecEnv, WebLogger } from '../../../aztecEnv';
import { createStore } from '@aztec/kv-store/indexeddb';
import { NetworkDB, WalletDB } from '../../../utils/storage';
import type { PXE } from '@aztec/aztec.js';
import { parseAliasedBuffersAsString } from './accountHelpers';
import { NETWORKS } from '../constants';
import type { Network } from '../types';

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
    const node = await AztecEnv.connectToNode(nodeUrl);
    setAztecNode(node);
    const pxe = await AztecEnv.initPXE(node, setLogs);
    const rollupAddress = (await pxe.getNodeInfo()).l1ContractAddresses.rollupAddress;
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
    console.error('Error connecting to network:', error);
    throw error;
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
 * Adds a new custom network
 */
export async function addNetwork(alias: string, url: string): Promise<void> {
  await NetworkDB.getInstance().storeNetwork(alias, url);
} 