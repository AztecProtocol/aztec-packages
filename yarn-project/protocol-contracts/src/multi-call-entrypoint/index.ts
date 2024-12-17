import { loadContractArtifact } from '@aztec/types/abi';
import { type NoirCompiledContract } from '@aztec/types/noir';

import MultiCallEntrypointJson from '../../artifacts/MultiCallEntrypoint.json' assert { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import { type ProtocolContract } from '../protocol_contract.js';

export const MultiCallEntrypointArtifact = loadContractArtifact(MultiCallEntrypointJson as NoirCompiledContract);

let protocolContract: ProtocolContract;

/** Returns the canonical deployment of the contract. */
export function getCanonicalMultiCallEntrypoint(): ProtocolContract {
  if (!protocolContract) {
    protocolContract = makeProtocolContract('MultiCallEntrypoint', MultiCallEntrypointArtifact);
  }
  return protocolContract;
}
