import { loadContractArtifact } from '@aztec/stdlib/abi';
import type { NoirCompiledContract } from '@aztec/stdlib/noir';

import ContractClassRegistererJson from '../../artifacts/ContractClassRegisterer.json' with { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import type { ProtocolContract } from '../protocol_contract.js';

export * from './contract_class_registered_event.js';
export * from './private_function_broadcasted_event.js';
export * from './utility_function_broadcasted_event.js';

export const ContractClassRegistererArtifact = loadContractArtifact(
  ContractClassRegistererJson as NoirCompiledContract,
);

let protocolContract: ProtocolContract;

/** Returns the canonical deployment of the contract. */
export async function getCanonicalClassRegisterer(): Promise<ProtocolContract> {
  if (!protocolContract) {
    const artifact = ContractClassRegistererArtifact;
    protocolContract = await makeProtocolContract('ContractClassRegisterer', artifact);
  }
  return protocolContract;
}
