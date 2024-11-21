import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';

/** Returns the canonical deployment of the router. */
export async function getCanonicalRouter(): Promise<ProtocolContract> {
  return await getCanonicalProtocolContract('Router');
}
