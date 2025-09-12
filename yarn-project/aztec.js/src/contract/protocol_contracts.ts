import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import type { Wallet } from '../wallet/wallet.js';
import { UnsafeContract } from './unsafe_contract.js';

/** Returns a Contract wrapper for the contract class registry. */
export async function getClassRegistryContract(wallet: Wallet) {
  const { contractInstance } = await wallet.getContractMetadata(ProtocolContractAddress.ContractClassRegistry);
  if (!contractInstance) {
    throw new Error("ContractClassRegistry is not registered in this wallet's instance");
  }
  const { artifact } = await wallet.getContractClassMetadata(contractInstance.currentContractClassId, true);

  return new UnsafeContract(contractInstance!, artifact!, wallet);
}

/** Returns a Contract wrapper for the contract instance registry. */
export async function getInstanceRegistryContract(wallet: Wallet) {
  const { contractInstance } = await wallet.getContractMetadata(ProtocolContractAddress.ContractInstanceRegistry);
  if (!contractInstance) {
    throw new Error("ContractInstanceRegistry is not registered in this wallet's instance");
  }
  const { artifact } = await wallet.getContractClassMetadata(contractInstance.currentContractClassId, true);
  return new UnsafeContract(contractInstance!, artifact!, wallet);
}

/** Returns a Contract wrapper for the fee juice contract */
export async function getFeeJuice(wallet: Wallet) {
  const { contractInstance } = await wallet.getContractMetadata(ProtocolContractAddress.FeeJuice);
  if (!contractInstance) {
    throw new Error("FeeJuice is not registered in this wallet's instance");
  }
  const { artifact } = await wallet.getContractClassMetadata(contractInstance.currentContractClassId, true);
  return new UnsafeContract(contractInstance!, artifact!, wallet);
}
