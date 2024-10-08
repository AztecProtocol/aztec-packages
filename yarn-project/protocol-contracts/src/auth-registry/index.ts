import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';

/** Returns the canonical deployment of the auth registry. */
export function getCanonicalAuthRegistry(): ProtocolContract {
  return getCanonicalProtocolContract('AuthRegistry');
}
