import type { AuthWitnessProvider } from '@aztec/aztec.js/account';
import { Schnorr } from '@aztec/foundation/crypto';
import { type Fr, GrumpkinScalar } from '@aztec/foundation/fields';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { CompleteAddress } from '@aztec/stdlib/contract';

import { DefaultAccountContract } from '../defaults/account_contract.js';

/**
 * Account contract that authenticates transactions using Schnorr signatures verified against
 * the note encryption key, relying on a single private key for both encryption and authentication.
 * This abstract version does not provide a way to retrieve the artifact, as it
 * can be implemented with or without lazy loading.
 */
export abstract class SingleKeyBaseAccountContract extends DefaultAccountContract {
  constructor(private encryptionPrivateKey: GrumpkinScalar) {
    super();
  }

  getDeploymentFunctionAndArgs() {
    return Promise.resolve(undefined);
  }

  getAuthWitnessProvider(account: CompleteAddress): AuthWitnessProvider {
    return new SingleKeyAuthWitnessProvider(this.encryptionPrivateKey, account);
  }
}

/**
 * Creates auth witnesses using Schnorr signatures and including the partial address and public key
 * in the witness, so verifiers do not need to store the public key and can instead validate it
 * by reconstructing the current address.
 */
class SingleKeyAuthWitnessProvider implements AuthWitnessProvider {
  constructor(
    private privateKey: GrumpkinScalar,
    private account: CompleteAddress,
  ) {}

  async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    const schnorr = new Schnorr();
    const signature = await schnorr.constructSignature(messageHash.toBuffer(), this.privateKey);
    const witness = [...this.account.publicKeys.toFields(), ...signature.toBuffer(), this.account.partialAddress];
    return Promise.resolve(new AuthWitness(messageHash, witness));
  }
}
