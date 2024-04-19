import { type AztecAddress } from '@aztec/circuits.js';

import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';
import { KeyRegistryArtifact } from './artifact.js';

/** Returns the canonical deployment of the gas token. */
export function getCanonicalKeyRegistry(): ProtocolContract {
  return getCanonicalProtocolContract(KeyRegistryArtifact, 1337);
}

export function getCanonicalKeyRegistryAddress(): AztecAddress {
  return getCanonicalKeyRegistry().address;
}

export async function deployCanonicalKeyRegistry(deployer: Wallet) {
  const canonicalKeyRegistry = getCanonicalKeyRegistry();

  if (await deployer.isContractClassPubliclyRegistered(canonicalKeyRegistry.contractClass.id)) {
    return;
  }

  await new BatchCall(deployer, [
    (await registerContractClass(deployer, canonicalKeyRegistry.artifact)).request(),
    deployInstance(deployer, canonicalKeyRegistry.instance).request(),
  ])
    .send()
    .wait();

  await expect(deployer.isContractClassPubliclyRegistered(canonicalKeyRegistry.contractClass.id)).resolves.toBe(true);
  await expect(deployer.getContractInstance(canonicalKeyRegistry.instance.address)).resolves.toBeDefined();
}
