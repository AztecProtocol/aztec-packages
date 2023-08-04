import { ContractAbi } from '@aztec/foundation/abi';
import { NodeInfo } from '@aztec/types';

import { Entrypoint } from '../index.js';
import { CompleteAddress } from './../complete_address.js';

export * from './ecdsa_account_contract.js';
export * from './schnorr_account_contract.js';
export * from './single_key_account_contract.js';

export interface AccountContract {
  getContractAbi(): ContractAbi;
  getDeploymentArgs(): Promise<any[]>;
  getEntrypoint(address: CompleteAddress, nodeInfo: NodeInfo): Promise<Entrypoint>;
}
