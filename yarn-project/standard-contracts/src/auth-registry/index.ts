import { Fr } from '@aztec/foundation/curves/bn254';
import type { ProtocolContract } from '@aztec/protocol-contracts';
import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeInitializationHash, getContractClassFromArtifact } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import AuthRegistryJson from '../../artifacts/AuthRegistry.json' with { type: 'json' };
import { AUTH_REGISTRY_ADDRESS, AUTH_REGISTRY_CLASS_ID } from './address.gen.js';

export { AUTH_REGISTRY_ADDRESS, AUTH_REGISTRY_CLASS_ID } from './address.gen.js';

let protocolContract: ProtocolContract;

export const AuthRegistryArtifact: ContractArtifact = loadContractArtifact(AuthRegistryJson as NoirCompiledContract);

/** Returns the standard deployment of the auth registry. */
export async function getStandardAuthRegistry(): Promise<ProtocolContract> {
  if (!protocolContract) {
    protocolContract = await buildAuthRegistryProtocolContract(AuthRegistryArtifact);
  }
  return protocolContract;
}

async function buildAuthRegistryProtocolContract(artifact: ContractArtifact): Promise<ProtocolContract> {
  const contractClass = await getContractClassFromArtifact(artifact);
  if (!contractClass.id.equals(AUTH_REGISTRY_CLASS_ID)) {
    throw new Error(
      `auth_registry artifact class id ${contractClass.id.toString()} does not match committed ` +
        `AUTH_REGISTRY_CLASS_ID ${AUTH_REGISTRY_CLASS_ID.toString()}; regenerate via ` +
        `\`yarn workspace @aztec/standard-contracts run regen:auth-registry-address\`.`,
    );
  }
  const constructorArtifact = artifact.functions.find(f => f.name === 'constructor');
  const initializationHash = await computeInitializationHash(constructorArtifact, []);

  const instance = {
    version: 1 as const,
    currentContractClassId: AUTH_REGISTRY_CLASS_ID,
    originalContractClassId: AUTH_REGISTRY_CLASS_ID,
    initializationHash,
    publicKeys: PublicKeys.default(),
    salt: new Fr(1),
    deployer: AztecAddress.ZERO,
    address: AUTH_REGISTRY_ADDRESS,
  };

  return { instance, contractClass, artifact, address: AUTH_REGISTRY_ADDRESS };
}
