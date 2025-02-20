import { getAccountContractAddress } from '@aztec/aztec.js';
import type { AuthWitnessProvider } from '@aztec/aztec.js/account';
import { AuthWitness } from '@aztec/circuit-types';
import type { CompleteAddress, GrumpkinScalar } from '@aztec/circuit-types';
import type { ContractArtifact } from '@aztec/circuits.js/abi';
import { deriveSigningKey } from '@aztec/circuits.js/keys';
import { Schnorr } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';

import { DefaultAccountContract } from '../defaults/account_contract.js';
import { SchnorrAccountContractArtifact } from './artifact.js';

/**
 * Account contract that authenticates transactions using Schnorr signatures
 * verified against a Grumpkin public key stored in an immutable encrypted note.
 */
export class SchnorrAccountContract extends DefaultAccountContract {
  constructor(private signingPrivateKey: GrumpkinScalar) {
    super(SchnorrAccountContractArtifact as ContractArtifact);
  }

  async getDeploymentArgs() {
    const signingPublicKey = await new Schnorr().computePublicKey(this.signingPrivateKey);
    return [signingPublicKey.x, signingPublicKey.y];
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new SchnorrAuthWitnessProvider(this.signingPrivateKey);
  }
}

/** Creates auth witnesses using Schnorr signatures. */
class SchnorrAuthWitnessProvider implements AuthWitnessProvider {
  constructor(private signingPrivateKey: GrumpkinScalar) {}

  async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    const schnorr = new Schnorr();
    const signature = await schnorr.constructSignature(messageHash.toBuffer(), this.signingPrivateKey);
    return new AuthWitness(messageHash, [...signature.toBuffer()]);
  }
}

/**
 * Compute the address of a schnorr account contract.
 * @param secret - A seed for deriving the signing key and public keys.
 * @param salt - The contract address salt.
 * @param signingPrivateKey - A specific signing private key that's not derived from the secret.
 */
export async function getSchnorrAccountContractAddress(secret: Fr, salt: Fr, signingPrivateKey?: GrumpkinScalar) {
  const signingKey = signingPrivateKey ?? deriveSigningKey(secret);
  const accountContract = new SchnorrAccountContract(signingKey);
  return await getAccountContractAddress(accountContract, secret, salt);
}
