import { secp256k1 } from '@noble/curves/secp256k1';
import { AztecAddress } from '../index.js';
import { AuthPayload, TxAuthProvider } from './index.js';

import { EntrypointPayload } from '../account_impl/account_contract.js';
import { EcdsaSignature, Schnorr } from '@aztec/circuits.js/barretenberg';

/**
 * Implementation of a schnorr signature provider
 */
export class SchnorrAuthProvider implements TxAuthProvider {
  constructor(private signer: Schnorr, private privateKey: Buffer) {}
  authenticateTx(_payload: EntrypointPayload, _payloadHash: Buffer, _address: AztecAddress): Promise<AuthPayload> {
    const sig = this.signer.constructSignature(_payloadHash, this.privateKey);
    return Promise.resolve(sig as AuthPayload);
  }
}

/**
 * An ecdsa implementation of TxAuthProvider.
 */
export class EcdsaAuthProvider implements TxAuthProvider {
  constructor(private privKey: Buffer) {}
  authenticateTx(payload: EntrypointPayload, payloadHash: Buffer, _address: AztecAddress): Promise<AuthPayload> {
    const sig = secp256k1.sign(payloadHash, this.privKey);
    if (sig.recovery === undefined) throw new Error(`Missing recovery from signature`);
    return Promise.resolve(EcdsaSignature.fromBigInts(sig.r, sig.s, sig.recovery));
  }
}
