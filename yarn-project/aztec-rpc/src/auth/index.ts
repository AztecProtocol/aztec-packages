import { AztecAddress, Fr } from '@aztec/circuits.js';
import { Tx } from '@aztec/types';

/**
 * An interface for the payload returned from auth operations.
 */
export interface AuthPayload {
  toBuffer(): Buffer;
  toFields(): Fr[];
}
/**
 * The interface for an auth operations provider.
 */
export interface TxAuthProvider {
  authenticateTx(payload: Tx, address: AztecAddress): Promise<AuthPayload>;
}
