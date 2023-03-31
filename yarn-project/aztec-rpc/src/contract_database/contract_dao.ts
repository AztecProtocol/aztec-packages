import { generateFunctionSelector } from '../abi_coder/index.js';
import { AztecAddress, EthAddress } from '@aztec/foundation';
import { ContractAbi, FunctionAbi } from '@aztec/noir-contracts';

export interface ContractFunctionDao extends FunctionAbi {
  selector: Buffer;
}

export interface ContractDao extends ContractAbi {
  address: AztecAddress;
  portalAddress: EthAddress;
  functions: ContractFunctionDao[];
}
