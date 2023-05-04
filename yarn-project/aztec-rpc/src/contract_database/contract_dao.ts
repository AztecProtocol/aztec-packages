import { generateFunctionSelector } from '../abi_coder/index.js';
import { ContractAbi, FunctionAbi } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';

export interface ContractFunctionDao extends FunctionAbi {
  selector: Buffer;
}

export interface ContractDao extends ContractAbi {
  address: AztecAddress;
  portalContract: EthAddress;
  functions: ContractFunctionDao[];
}

export function toContractDao(abi: ContractAbi, address: AztecAddress, portalContract: EthAddress): ContractDao {
  const functions = abi.functions.map(f => ({
    ...f,
    selector: generateFunctionSelector(f.name, f.parameters),
  }));
  return {
    ...abi,
    address,
    functions,
    portalContract,
  };
}
