import { type AuthWitnessProvider } from '@aztec/aztec.js/account';
import { AuthWitness } from '@aztec/circuit-types/auth-witness';
import { type ContractArtifact } from '@aztec/circuits.js/abi';
import { CompleteAddress } from '@aztec/circuits.js/contract';
import { Ecdsa } from '@aztec/foundation/crypto';
import { type Fr } from '@aztec/foundation/fields';

import { DefaultAccountContract } from '../../defaults/account_contract.js';
import { EcdsaKAccountContractArtifact } from './artifact.js';

/**
 * Account contract that authenticates transactions using ECDSA signatures
 * verified against a secp256k1 public key stored in an immutable encrypted note.
 */
export class EcdsaKAccountContract extends DefaultAccountContract {
  constructor(private signingPrivateKey: Buffer) {
    super(EcdsaKAccountContractArtifact as ContractArtifact);
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
