import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import ContractInstanceRegistryJson from '../../artifacts/ContractInstanceRegistry.json' with { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

export * from './contract_instance_published_event.js';
export * from './contract_instance_updated_event.js';

export const ContractInstanceRegistryArtifact = loadContractArtifact(
  ContractInstanceRegistryJson as NoirCompiledContract,
);

let protocolContract: ProtocolContract;

/** Returns the canonical deployment of the contract. */
export async function getCanonicalInstanceRegistry(): Promise<ProtocolContract> {
  if (!protocolContract) {
    protocolContract = await makeProtocolContract('ContractInstanceRegistry', ContractInstanceRegistryArtifact);
  }
  return protocolContract;
}
