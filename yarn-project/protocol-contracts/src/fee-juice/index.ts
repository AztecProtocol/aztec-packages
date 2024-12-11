import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';

/** Returns the canonical deployment of the Fee Juice. */
export function getCanonicalFeeJuice(): ProtocolContract {
  return getCanonicalProtocolContract('FeeJuice');
}
