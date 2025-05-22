import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import MultiCallEntrypointJson from '../../artifacts/MultiCallEntrypoint.json' with { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

export const MultiCallEntrypointArtifact = loadContractArtifact(MultiCallEntrypointJson as NoirCompiledContract);

let protocolContract: ProtocolContract;

/** Returns the canonical deployment of the contract. */
export async function getCanonicalMultiCallEntrypoint(): Promise<ProtocolContract> {
  if (!protocolContract) {
    protocolContract = await makeProtocolContract('MultiCallEntrypoint', MultiCallEntrypointArtifact);
  }
  return protocolContract;
}
