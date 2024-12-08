import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';

export * from './contract_class_registered_event.js';
export * from './private_function_broadcasted_event.js';
export * from './unconstrained_function_broadcasted_event.js';

/** Returns the canonical deployment of the class registerer contract. */
export async function getCanonicalClassRegisterer(): Promise<ProtocolContract> {
  return await getCanonicalProtocolContract('ContractClassRegisterer');
}
