import type { AuthWitnessProvider } from '@aztec/aztec.js/account';
import { Ecdsa } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { CompleteAddress } from '@aztec/stdlib/contract';

import { DefaultAccountContract } from '../../defaults/account_contract.js';

/**
 * Account contract that authenticates transactions using ECDSA signatures
 * verified against a secp256r1 public key stored in an immutable encrypted note.
 * This abstract version does not provide a way to retrieve the artifact, as it
 * can be implemented with or without lazy loading.
 */
export abstract class EcdsaRBaseAccountContract extends DefaultAccountContract {
  constructor(private signingPrivateKey: Buffer) {
    super();
  }

  async getDeploymentFunctionAndArgs() {
    const signingPublicKey = await new Ecdsa('secp256r1').computePublicKey(this.signingPrivateKey);
    return {
      constructorName: 'constructor',
      constructorArgs: [signingPublicKey.subarray(0, 32), signingPublicKey.subarray(32, 64)],
    };
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new EcdsaRAuthWitnessProvider(this.signingPrivateKey);
  }
}

/** Creates auth witnesses using ECDSA signatures. */
class EcdsaRAuthWitnessProvider implements AuthWitnessProvider {
  constructor(private signingPrivateKey: Buffer) {}

  async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    const ecdsa = new Ecdsa('secp256r1');
    const signature = await ecdsa.constructSignature(messageHash.toBuffer(), this.signingPrivateKey);
    return Promise.resolve(new AuthWitness(messageHash, [...signature.r, ...signature.s]));
  }
}
