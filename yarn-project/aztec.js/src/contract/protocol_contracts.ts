import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import type { Wallet } from '../wallet/wallet.js';
import { UnsafeContract } from './unsafe_contract.js';

/**
 * Returns a Contract wrapper for the contract class registry.
 * The class registry is a protocol contract that stores contract classes (bytecode) on-chain.
 *
 * @param wallet - The wallet to use for interacting with the registry.
 * @returns An UnsafeContract instance for the class registry.
 * @throws If the ContractClassRegistry is not registered in the wallet.
 */
export async function getClassRegistryContract(wallet: Wallet) {
  const { contractInstance } = await wallet.getContractMetadata(ProtocolContractAddress.ContractClassRegistry);
  if (!contractInstance) {
    throw new Error("ContractClassRegistry is not registered in this wallet's instance");
  }
  const { artifact } = await wallet.getContractClassMetadata(contractInstance.currentContractClassId, true);

  return new UnsafeContract(contractInstance!, artifact!, wallet);
}

/**
 * Returns a Contract wrapper for the contract instance registry.
 * The instance registry is a protocol contract that stores deployed contract instances on-chain.
 *
 * @param wallet - The wallet to use for interacting with the registry.
 * @returns An UnsafeContract instance for the instance registry.
 * @throws If the ContractInstanceRegistry is not registered in the wallet.
 */
export async function getInstanceRegistryContract(wallet: Wallet) {
  const { contractInstance } = await wallet.getContractMetadata(ProtocolContractAddress.ContractInstanceRegistry);
  if (!contractInstance) {
    throw new Error("ContractInstanceRegistry is not registered in this wallet's instance");
  }
  const { artifact } = await wallet.getContractClassMetadata(contractInstance.currentContractClassId, true);
  return new UnsafeContract(contractInstance!, artifact!, wallet);
}

/**
 * Returns a Contract wrapper for the fee juice contract.
 * The fee juice contract is a protocol contract that manages gas fees in the Aztec network.
 *
 * @param wallet - The wallet to use for interacting with the fee juice contract.
 * @returns An UnsafeContract instance for the fee juice contract.
 * @throws If the FeeJuice contract is not registered in the wallet.
 */
export async function getFeeJuice(wallet: Wallet) {
  const { contractInstance } = await wallet.getContractMetadata(ProtocolContractAddress.FeeJuice);
  if (!contractInstance) {
    throw new Error("FeeJuice is not registered in this wallet's instance");
  }
  const { artifact } = await wallet.getContractClassMetadata(contractInstance.currentContractClassId, true);
  return new UnsafeContract(contractInstance!, artifact!, wallet);
}
