import { ProtocolContractAddress } from '@aztec/protocol-contracts';

import { UnsafeContract } from '../contract/unsafe_contract.js';
import type { Wallet } from '../wallet/index.js';

/** Returns a Contract wrapper for the class registerer. */
export async function getRegistererContract(wallet: Wallet) {
  const { contractInstance } = await wallet.getContractMetadata(ProtocolContractAddress.ContractClassRegisterer);
  const { artifact } = await wallet.getContractClassMetadata(contractInstance?.currentContractClassId!, true);

  return new UnsafeContract(contractInstance!, artifact!, wallet);
}

/** Returns a Contract wrapper for the instance deployer. */
export async function getDeployerContract(wallet: Wallet) {
  const { contractInstance } = await wallet.getContractMetadata(ProtocolContractAddress.ContractInstanceDeployer);
  const { artifact } = await wallet.getContractClassMetadata(contractInstance?.currentContractClassId!, true);
  return new UnsafeContract(contractInstance!, artifact!, wallet);
}
