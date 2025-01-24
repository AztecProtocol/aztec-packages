import { getCanonicalClassRegisterer } from '@aztec/protocol-contracts/class-registerer';
import { getCanonicalInstanceDeployer } from '@aztec/protocol-contracts/instance-deployer';

import { UnsafeContract } from '../contract/unsafe_contract.js';
import { type Wallet } from '../wallet/index.js';

/** Returns a Contract wrapper for the class registerer. */
export async function getRegistererContract(wallet: Wallet) {
  const { artifact, instance } = await getCanonicalClassRegisterer();
  return new UnsafeContract(instance, artifact, wallet);
}

/** Returns a Contract wrapper for the instance deployer. */
export async function getDeployerContract(wallet: Wallet) {
  const { artifact, instance } = await getCanonicalInstanceDeployer();
  return new UnsafeContract(instance, artifact, wallet);
}
