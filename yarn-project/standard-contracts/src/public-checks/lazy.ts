import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';

import { makeStandardContract } from '../make_standard_contract.js';
import type { StandardContract } from '../standard_contract.js';

export { PUBLIC_CHECKS_ADDRESS, PUBLIC_CHECKS_CLASS_ID } from './address.js';

let standardContract: StandardContract;
let standardContractArtifact: ContractArtifact;

export async function getPublicChecksArtifact(): Promise<ContractArtifact> {
  if (!standardContractArtifact) {
    // Cannot assert this import as it's incompatible with bundlers like vite
    // https://github.com/vitejs/vite/issues/19095#issuecomment-2566074352
    // Even if now supported by all major browsers, the MIME type is replaced with
    // "text/javascript"
    // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
    const { default: publicChecksJson } = await import('../../artifacts/PublicChecks.json');
    standardContractArtifact = loadContractArtifact(publicChecksJson);
  }
  return standardContractArtifact;
}

/** Returns the standard deployment of public_checks. */
export async function getStandardPublicChecks(): Promise<StandardContract> {
  if (!standardContract) {
    const artifact = await getPublicChecksArtifact();
    standardContract = makeStandardContract('PublicChecks', artifact);
  }
  return standardContract;
}
