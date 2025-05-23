import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import type { Wallet } from '../wallet/wallet.js';
import { UnsafeContract } from './unsafe_contract.js';

/** Returns a Contract wrapper for the class registerer. */
export async function getRegistererContract(wallet: Wallet) {
  const { contractInstance } = await wallet.getContractMetadata(ProtocolContractAddress.ContractClassRegisterer);
  if (!contractInstance) {
    throw new Error("ContractClassRegisterer is not registered in this wallet's instance");
  }
  const { artifact } = await wallet.getContractClassMetadata(contractInstance.currentContractClassId, true);

  return new UnsafeContract(contractInstance!, artifact!, wallet);
}

/** Returns a Contract wrapper for the instance deployer. */
export async function getDeployerContract(wallet: Wallet) {
  const { contractInstance } = await wallet.getContractMetadata(ProtocolContractAddress.ContractInstanceDeployer);
  if (!contractInstance) {
    throw new Error("ContractInstanceDeployer is not registered in this wallet's instance");
  }
  const { artifact } = await wallet.getContractClassMetadata(contractInstance.currentContractClassId, true);
  return new UnsafeContract(contractInstance!, artifact!, wallet);
}

/** Returns a Contract wrapper for the fee juice */
export async function getFeeJuice(wallet: Wallet) {
  const { contractInstance } = await wallet.getContractMetadata(ProtocolContractAddress.FeeJuice);
  if (!contractInstance) {
    throw new Error("FeeJuice is not registered in this wallet's instance");
  }
  const { artifact } = await wallet.getContractClassMetadata(contractInstance.currentContractClassId, true);
  return new UnsafeContract(contractInstance!, artifact!, wallet);
}
