import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';

/** Returns the canonical deployment of the router. */
export function getCanonicalRouter(): ProtocolContract {
  return getCanonicalProtocolContract('Router');
}
