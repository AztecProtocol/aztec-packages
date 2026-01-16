import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import RouterJson from '../../artifacts/Router.json' with { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

export const RouterArtifact = loadContractArtifact(RouterJson as NoirCompiledContract);

let protocolContract: ProtocolContract;

/** Returns the canonical deployment of the contract. */
export async function getCanonicalRouter(): Promise<ProtocolContract> {
  if (!protocolContract) {
    protocolContract = await makeProtocolContract('Router', RouterArtifact);
  }
  return protocolContract;
}
