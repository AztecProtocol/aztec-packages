import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';

import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

let protocolContract: ProtocolContract;
let protocolContractArtifact: ContractArtifact;

export async function getFeeJuiceArtifact(): Promise<ContractArtifact> {
  if (!protocolContractArtifact) {
    const { default: feeJuiceJson } = await import('../../artifacts/FeeJuice.json', { assert: { type: 'json' } });
    protocolContractArtifact = loadContractArtifact(feeJuiceJson);
  }
  return protocolContractArtifact;
}

/** Returns the canonical deployment of the auth registry. */
export async function getCanonicalFeeJuice(): Promise<ProtocolContract> {
  if (!protocolContract) {
    const feeJuiceArtifact = await getFeeJuiceArtifact();
    protocolContract = await makeProtocolContract('FeeJuice', feeJuiceArtifact);
  }
  return protocolContract;
}
