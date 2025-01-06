import { loadContractArtifact } from '@aztec/types/abi';
import { type NoirCompiledContract } from '@aztec/types/noir';

import ContractClassRegistererJson from '../../artifacts/ContractClassRegisterer.json' assert { type: 'json' };
import { makeProtocolContract } from '../make_protocol_contract.js';
import { type ProtocolContract } from '../protocol_contract.js';

export * from './contract_class_registered_event.js';
export * from './private_function_broadcasted_event.js';
export * from './unconstrained_function_broadcasted_event.js';

export const ContractClassRegistererArtifact = loadContractArtifact(
  ContractClassRegistererJson as NoirCompiledContract,
);

let protocolContract: ProtocolContract;

/** Returns the canonical deployment of the contract. */
export function getCanonicalClassRegisterer(): ProtocolContract {
  if (!protocolContract) {
    const artifact = ContractClassRegistererArtifact;
    protocolContract = makeProtocolContract('ContractClassRegisterer', artifact);
  }
  return protocolContract;
}
