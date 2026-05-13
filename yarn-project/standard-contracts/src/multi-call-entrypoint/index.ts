import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import MultiCallEntrypointJson from '../../artifacts/MultiCallEntrypoint.json' with { type: 'json' };
import { makeStandardContract } from '../make_standard_contract.js';
import type { StandardContract } from '../standard_contract.js';

export { STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS, STANDARD_MULTI_CALL_ENTRYPOINT_CLASS_ID } from './address.js';

export const MultiCallEntrypointArtifact = loadContractArtifact(MultiCallEntrypointJson as NoirCompiledContract);

let standardContract: StandardContract;

/** Returns the standard deployment of the multi-call entrypoint. */
export function getStandardMultiCallEntrypoint(): Promise<StandardContract> {
  if (!standardContract) {
    standardContract = makeStandardContract('MultiCallEntrypoint', MultiCallEntrypointArtifact);
  }
  return Promise.resolve(standardContract);
}
