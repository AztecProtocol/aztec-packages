import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import AuthRegistryJson from '../../artifacts/AuthRegistry.json' with { type: 'json' };
import { makeStandardContract } from '../make_standard_contract.js';
import type { StandardContract } from '../standard_contract.js';

export {
  STANDARD_AUTH_REGISTRY_ADDRESS,
  STANDARD_AUTH_REGISTRY_CLASS_ID,
  STANDARD_AUTH_REGISTRY_SALT,
} from './constants.js';

export const AuthRegistryArtifact = loadContractArtifact(AuthRegistryJson as NoirCompiledContract);

let standardContract: StandardContract;

/** Returns the standard deployment of the auth registry. */
export function getStandardAuthRegistry(): Promise<StandardContract> {
  if (!standardContract) {
    standardContract = makeStandardContract('AuthRegistry', AuthRegistryArtifact);
  }
  return Promise.resolve(standardContract);
}
