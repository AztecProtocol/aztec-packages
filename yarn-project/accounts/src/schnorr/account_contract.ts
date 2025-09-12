import type { AuthWitnessProvider } from '@aztec/aztec.js/account';
import { Schnorr } from '@aztec/foundation/crypto';
import { Fr, GrumpkinScalar } from '@aztec/foundation/fields';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { CompleteAddress } from '@aztec/stdlib/contract';

import { DefaultAccountContract } from '../defaults/account_contract.js';

/**
 * Account contract that authenticates transactions using Schnorr signatures
 * verified against a Grumpkin public key stored in an immutable encrypted note.
 * This abstract version does not provide a way to retrieve the artifact, as it
 * can be implemented with or without lazy loading.
 */
export abstract class SchnorrBaseAccountContract extends DefaultAccountContract {
  constructor(private signingPrivateKey: GrumpkinScalar) {
    super();
  }

  async getInitializationFunctionAndArgs() {
    const signingPublicKey = await new Schnorr().computePublicKey(this.signingPrivateKey);
    return { constructorName: 'constructor', constructorArgs: [signingPublicKey.x, signingPublicKey.y] };
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new SchnorrAuthWitnessProvider(this.signingPrivateKey);
  }
}

/** Creates auth witnesses using Schnorr signatures. */
export class SchnorrAuthWitnessProvider implements AuthWitnessProvider {
  constructor(private signingPrivateKey: GrumpkinScalar) {}

  async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    const schnorr = new Schnorr();
    const signature = await schnorr.constructSignature(messageHash.toBuffer(), this.signingPrivateKey);
    return new AuthWitness(messageHash, [...signature.toBuffer()]);
  }
}
