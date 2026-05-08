import { Fr } from '@aztec/foundation/curves/bn254';
import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  computeContractAddressFromInstance,
  computeInitializationHash,
  getContractClassFromArtifact,
} from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import AuthRegistryJson from '../../artifacts/AuthRegistry.json' with { type: 'json' };
import type { ProtocolContract } from '../protocol_contract.js';
import { AUTH_REGISTRY_ADDRESS, AUTH_REGISTRY_CLASS_ID } from './address.gen.js';

const SALT = new Fr(1);
const DEPLOYER = AztecAddress.zero();

let protocolContract: ProtocolContract;

export const AuthRegistryArtifact: ContractArtifact = loadContractArtifact(AuthRegistryJson as NoirCompiledContract);

/** Address of the canonical auth_registry deployment, derived from its compiled artifact. */
export function getAuthRegistryAddress(): AztecAddress {
  return AUTH_REGISTRY_ADDRESS;
}

/** Class id of the canonical auth_registry deployment, derived from its compiled artifact. */
export function getAuthRegistryClassId(): Fr {
  return AUTH_REGISTRY_CLASS_ID;
}

/** Returns the canonical deployment of the auth registry. */
export async function getCanonicalAuthRegistry(): Promise<ProtocolContract> {
  if (!protocolContract) {
    const contractClass = await getContractClassFromArtifact(AuthRegistryArtifact);
    if (!contractClass.id.equals(AUTH_REGISTRY_CLASS_ID)) {
      throw new Error(
        `auth_registry artifact class id (${contractClass.id.toString()}) does not match stamped class id (${AUTH_REGISTRY_CLASS_ID.toString()}); rerun \`yarn generate:auth-registry-address\` in protocol-contracts.`,
      );
    }
    const constructorArtifact = AuthRegistryArtifact.functions.find(f => f.name === 'constructor');
    const initializationHash = await computeInitializationHash(constructorArtifact, []);
    const instance = {
      version: 1 as const,
      currentContractClassId: contractClass.id,
      originalContractClassId: contractClass.id,
      initializationHash,
      publicKeys: PublicKeys.default(),
      salt: SALT,
      deployer: DEPLOYER,
      address: AUTH_REGISTRY_ADDRESS,
    };
    const derivedAddress = await computeContractAddressFromInstance(instance);
    if (!derivedAddress.equals(AUTH_REGISTRY_ADDRESS)) {
      throw new Error(
        `auth_registry derived address (${derivedAddress.toString()}) does not match stamped address (${AUTH_REGISTRY_ADDRESS.toString()}); rerun \`yarn generate:auth-registry-address\` in protocol-contracts.`,
      );
    }
    protocolContract = { instance, contractClass, artifact: AuthRegistryArtifact, address: AUTH_REGISTRY_ADDRESS };
  }
  return protocolContract;
}
