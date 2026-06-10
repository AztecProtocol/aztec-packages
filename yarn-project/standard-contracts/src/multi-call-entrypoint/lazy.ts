import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';

import { makeStandardContract } from '../make_standard_contract.js';
import type { StandardContract } from '../standard_contract.js';

export {
  STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS,
  STANDARD_MULTI_CALL_ENTRYPOINT_CLASS_ID,
  STANDARD_MULTI_CALL_ENTRYPOINT_SALT,
} from './constants.js';

let standardContract: StandardContract;
let standardContractArtifact: ContractArtifact;

export async function getMultiCallEntrypointArtifact(): Promise<ContractArtifact> {
  if (!standardContractArtifact) {
    const { default: multiCallEntrypointJson } = await import('../../artifacts/MultiCallEntrypoint.json', {
      with: { type: 'json' },
    });
    standardContractArtifact = loadContractArtifact(multiCallEntrypointJson);
  }
  return standardContractArtifact;
}

/** Returns the standard deployment of the multi-call entrypoint. */
export async function getStandardMultiCallEntrypoint(): Promise<StandardContract> {
  if (!standardContract) {
    const artifact = await getMultiCallEntrypointArtifact();
    standardContract = makeStandardContract('MultiCallEntrypoint', artifact);
  }
  return standardContract;
}
