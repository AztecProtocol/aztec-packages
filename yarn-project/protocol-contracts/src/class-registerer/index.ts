import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';

/** Returns the canonical deployment of the class registerer contract. */
export async function getCanonicalClassRegisterer(): Promise<ProtocolContract> {
  return await getCanonicalProtocolContract('ContractClassRegisterer');
}
