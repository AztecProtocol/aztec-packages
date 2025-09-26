import type { ContractArtifact } from '../abi/abi.js';
import type { ContractClassWithId } from './interfaces/contract_class.js';

export interface ContractClassMetadata {
  contractClass?: ContractClassWithId | undefined;
  isContractClassPubliclyRegistered: boolean;
  artifact?: ContractArtifact | undefined;
}
