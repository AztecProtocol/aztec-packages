import { Fr } from '@aztec/foundation/curves/bn254';
import type { ProtocolContract } from '@aztec/protocol-contracts';
import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computeInitializationHash, getContractClassFromArtifact } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';

import { AUTH_REGISTRY_ADDRESS, AUTH_REGISTRY_CLASS_ID } from './address.gen.js';

let protocolContract: ProtocolContract;
let protocolContractArtifact: ContractArtifact;

export async function getAuthRegistryArtifact(): Promise<ContractArtifact> {
  if (!protocolContractArtifact) {
    // Cannot assert this import as it's incompatible with bundlers like vite
    // https://github.com/vitejs/vite/issues/19095#issuecomment-2566074352
    // Even if now supported by al major browsers, the MIME type is replaced with
    // "text/javascript"
    // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
    const { default: authRegistryJson } = await import('../../artifacts/AuthRegistry.json');
    protocolContractArtifact = loadContractArtifact(authRegistryJson);
  }
  return protocolContractArtifact;
}

/** Returns the standard deployment of the auth registry. */
export async function getStandardAuthRegistry(): Promise<ProtocolContract> {
  if (!protocolContract) {
    const authRegistryArtifact = await getAuthRegistryArtifact();
    const contractClass = await getContractClassFromArtifact(authRegistryArtifact);
    if (!contractClass.id.equals(AUTH_REGISTRY_CLASS_ID)) {
      throw new Error(
        `auth_registry artifact class id ${contractClass.id.toString()} does not match committed ` +
          `AUTH_REGISTRY_CLASS_ID ${AUTH_REGISTRY_CLASS_ID.toString()}; regenerate via ` +
          `\`yarn workspace @aztec/standard-contracts run regen:auth-registry-address\`.`,
      );
    }
    const constructorArtifact = authRegistryArtifact.functions.find(f => f.name === 'constructor');
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

    protocolContract = { instance, contractClass, artifact: authRegistryArtifact, address: AUTH_REGISTRY_ADDRESS };
  }
  return protocolContract;
}
