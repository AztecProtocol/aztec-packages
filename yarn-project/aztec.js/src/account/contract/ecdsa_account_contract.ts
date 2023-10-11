import { Ecdsa } from '@aztec/circuits.js/barretenberg';
import { ContractArtifact } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { AuthWitness, CompleteAddress } from '@aztec/types';

import EcdsaAccountContractArtifact from '../../artifacts/ecdsa_account_contract.json' assert { type: 'json' };
import { AuthWitnessProvider } from '../interface.js';
import { BaseAccountContract } from './base_account_contract.js';

/**
 * Account contract that authenticates transactions using ECDSA signatures
 * verified against a secp256k1 public key stored in an immutable encrypted note.
 */
export class EcdsaAccountContract extends BaseAccountContract {
  constructor(private signingPrivateKey: Buffer) {
    super(EcdsaAccountContractArtifact as ContractArtifact);
  }

  async getDeploymentArgs() {
    const signingPublicKey = await Ecdsa.new().then(e => e.computePublicKey(this.signingPrivateKey));
    return [signingPublicKey.subarray(0, 32), signingPublicKey.subarray(32, 64)];
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new EcdsaAuthWitnessProvider(this.signingPrivateKey);
  }
}

/** Creates auth witnesses using ECDSA signatures. */
class EcdsaAuthWitnessProvider implements AuthWitnessProvider {
  constructor(private signingPrivateKey: Buffer) {}

  async createAuthWitness(message: Fr): Promise<AuthWitness> {
    const ecdsa = await Ecdsa.new();
    const signature = ecdsa.constructSignature(message.toBuffer(), this.signingPrivateKey);
    return new AuthWitness(message, [...signature.r, ...signature.s]);
  }
}
