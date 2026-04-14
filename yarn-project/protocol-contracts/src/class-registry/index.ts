import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import ContractClassRegistryJson from '../../artifacts/ContractClassRegistry.json' with { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

export * from './contract_class_published_event.js';

export const ContractClassRegistryArtifact = loadContractArtifact(ContractClassRegistryJson as NoirCompiledContract);

let protocolContract: ProtocolContract;

/** Returns the canonical deployment of the contract. */
export function getCanonicalClassRegistry(): Promise<ProtocolContract> {
  if (!protocolContract) {
    const artifact = ContractClassRegistryArtifact;
    protocolContract = makeProtocolContract('ContractClassRegistry', artifact);
  }
  return Promise.resolve(protocolContract);
}
