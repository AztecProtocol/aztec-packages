import { type ProtocolContract, getCanonicalProtocolContract } from '../protocol_contract.js';

/** Returns the canonical deployment of the Fee Juice. */
export async function getCanonicalFeeJuice(): Promise<ProtocolContract> {
  return await getCanonicalProtocolContract('FeeJuice');
}
