import type { ContractInstanceWithAddress } from './interfaces/contract_instance.js';

export interface ContractMetadata {
  contractInstance?: ContractInstanceWithAddress | undefined;
  isContractInitialized: boolean;
  isContractPublished: boolean;
}
