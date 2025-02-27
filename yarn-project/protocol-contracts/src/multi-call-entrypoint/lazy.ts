import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';

import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

let protocolContract: ProtocolContract;
let protocolContractArtifact: ContractArtifact;

export async function getMultiCallEntrypointArtifact(): Promise<ContractArtifact> {
  if (!protocolContractArtifact) {
    const { default: multiCallEntrypointJson } = await import('../../artifacts/MultiCallEntrypoint.json');
    protocolContractArtifact = loadContractArtifact(multiCallEntrypointJson);
  }
  return protocolContractArtifact;
}

/** Returns the canonical deployment of the auth registry. */
export async function getCanonicalMultiCallEntrypoint(): Promise<ProtocolContract> {
  if (!protocolContract) {
    const multiCallEntrypointArtifact = await getMultiCallEntrypointArtifact();
    protocolContract = await makeProtocolContract('MultiCallEntrypoint', multiCallEntrypointArtifact);
  }
  return protocolContract;
}
