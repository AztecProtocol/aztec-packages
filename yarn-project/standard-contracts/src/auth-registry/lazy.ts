import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';

import { makeStandardContract } from '../make_standard_contract.js';
import type { StandardContract } from '../standard_contract.js';

export {
  STANDARD_AUTH_REGISTRY_ADDRESS,
  STANDARD_AUTH_REGISTRY_CLASS_ID,
  STANDARD_AUTH_REGISTRY_SALT,
} from './constants.js';

let standardContract: StandardContract;
let standardContractArtifact: ContractArtifact;

export async function getAuthRegistryArtifact(): Promise<ContractArtifact> {
  if (!standardContractArtifact) {
    // Cannot assert this import as it's incompatible with bundlers like vite
    // https://github.com/vitejs/vite/issues/19095#issuecomment-2566074352
    // Even if now supported by all major browsers, the MIME type is replaced with
    // "text/javascript"
    // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
    const { default: authRegistryJson } = await import('../../artifacts/AuthRegistry.json');
    standardContractArtifact = loadContractArtifact(authRegistryJson);
  }
  return standardContractArtifact;
}

/** Returns the standard deployment of the auth registry. */
export async function getStandardAuthRegistry(): Promise<StandardContract> {
  if (!standardContract) {
    const artifact = await getAuthRegistryArtifact();
    standardContract = makeStandardContract('AuthRegistry', artifact);
  }
  return standardContract;
}
