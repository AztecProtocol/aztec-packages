import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';

/** Returns the canonical deployment of the auth registry. */
export async function getCanonicalAuthRegistry(): Promise<ProtocolContract> {
  return await getCanonicalProtocolContract('AuthRegistry');
}
