import { type ContractArtifact, loadContractArtifact } from '@aztec/stdlib/abi';

import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

let protocolContract: ProtocolContract;
let protocolContractArtifact: ContractArtifact;

export async function getAuthRegistryArtifact(): Promise<ContractArtifact> {
  if (!protocolContractArtifact) {
    // Cannot assert this import as it's incompatible with bundlers like vite
    // https://github.com/vitejs/vite/issues/19095#issuecomment-2566074352
    // Even if now supported by al major browsers, the MIME type is replaced with
    // "text/javascript"
    // In the meantime, this lazy import is INCOMPATIBLE WITH NODEJS
    const { default: authRegistryJson } = await import('../../artifacts/AuthRegistry.json');
    protocolContractArtifact = loadContractArtifact(authRegistryJson);
  }
  return protocolContractArtifact;
}

/** Returns the canonical deployment of the auth registry. */
export async function getCanonicalAuthRegistry(): Promise<ProtocolContract> {
  if (!protocolContract) {
    const authRegistryArtifact = await getAuthRegistryArtifact();
    protocolContract = await makeProtocolContract('AuthRegistry', authRegistryArtifact);
  }
  return protocolContract;
}
