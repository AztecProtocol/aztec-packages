import { AztecAddress, Fr } from '@aztec/aztec.js';
import type { WalletDB } from '../../../utils/storage';
import type { AliasedItem } from '../types';
import { parseAliasedBuffersAsString } from './accountHelpers';

/**
 * Loads all contracts from the WalletDB
 */
export async function loadContracts(walletDB: WalletDB): Promise<AliasedItem[]> {
  try {
    const aliasedContracts = await walletDB.listAliases('contracts');
    return parseAliasedBuffersAsString(aliasedContracts);
  } catch (error) {
    console.error('Error loading contracts:', error);
    return [];
  }
}

/**
 * Sets the current contract address in the application state
 */
export function setContract(
  contractAddress: string | null,
  setSelectedPredefinedContract: (contract: string) => void,
  setCurrentContractAddress: (address: AztecAddress | null) => void,
  setShowContractInterface: (show: boolean) => void,
  predefinedContract?: string
): void {
  try {
    if (predefinedContract) {
      setSelectedPredefinedContract(predefinedContract);
      setCurrentContractAddress(null);
      setShowContractInterface(true);
      return;
    }
    
    if (!contractAddress) {
      return;
    }
    
    setSelectedPredefinedContract('');
    const address = AztecAddress.fromString(contractAddress);
    setCurrentContractAddress(address);
    setShowContractInterface(true);
  } catch (error) {
    console.error('Error setting contract address:', error);
  }
} 