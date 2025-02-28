import type { AuthWitnessProvider } from '@aztec/aztec.js/account';
import { Ecdsa } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { CompleteAddress } from '@aztec/stdlib/contract';

import { DefaultAccountContract } from '../../defaults/account_contract.js';

/**
 * Account contract that authenticates transactions using ECDSA signatures
 * verified against a secp256k1 public key stored in an immutable encrypted note.
 * This abstract version does not provide a way to retrieve the artifact, as it
 * can be implemented with or without lazy loading.
 */
export abstract class EcdsaKBaseAccountContract extends DefaultAccountContract {
  constructor(private signingPrivateKey: Buffer) {
    super();
  }

  async getDeploymentArgs() {
    const signingPublicKey = await new Ecdsa().computePublicKey(this.signingPrivateKey);
    return [signingPublicKey.subarray(0, 32), signingPublicKey.subarray(32, 64)];
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new EcdsaKAuthWitnessProvider(this.signingPrivateKey);
  }
}

/** Creates auth witnesses using ECDSA signatures. */
class EcdsaKAuthWitnessProvider implements AuthWitnessProvider {
  constructor(private signingPrivateKey: Buffer) {}

  async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    const ecdsa = new Ecdsa();
    const signature = await ecdsa.constructSignature(messageHash.toBuffer(), this.signingPrivateKey);
    return Promise.resolve(new AuthWitness(messageHash, [...signature.r, ...signature.s]));
  }
}
