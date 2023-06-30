import { AuthPayload, AztecAddress, Tx, TxAuthProvider } from '@aztec/aztec.js';

/**
 * Implementation of a schnorr signature provider
 */
export class SchnorrAuthProvider implements TxAuthProvider {
  authenticateTx(_payload: Tx, _address: AztecAddress): Promise<AuthPayload> {
    throw new Error('Method not implemented.');
  }
}
