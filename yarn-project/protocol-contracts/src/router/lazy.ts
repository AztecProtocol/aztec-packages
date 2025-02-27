import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';

import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

let protocolContract: ProtocolContract;
let protocolContractArtifact: ContractArtifact;

export async function getRouterArtifact(): Promise<ContractArtifact> {
  if (!protocolContractArtifact) {
    const { default: routerJson } = await import('../../artifacts/Router.json');
    protocolContractArtifact = loadContractArtifact(routerJson);
  }
  return protocolContractArtifact;
}

/** Returns the canonical deployment of the auth registry. */
export async function getCanonicalRouter(): Promise<ProtocolContract> {
  if (!protocolContract) {
    const routerArtifact = await getRouterArtifact();
    protocolContract = await makeProtocolContract('Router', routerArtifact);
  }
  return protocolContract;
}
