import { type AuthWitnessProvider } from '@aztec/aztec.js/account';
import { AuthWitness, type CompleteAddress } from '@aztec/circuit-types';
import { type ContractArtifact } from '@aztec/foundation/abi';
import { type Fr } from '@aztec/foundation/fields';

import { DefaultAccountContract } from '../../defaults/account_contract.js';
import { signWithAgent } from '../../utils/ssh_agent.js';
import { EcdsaRAccountContractArtifact } from './artifact.js';

/**
 * Account contract that authenticates transactions using ECDSA signatures
 * verified against a secp256r1 public key stored in an immutable encrypted note.
 */
export class EcdsaRSSHAccountContract extends DefaultAccountContract {
  constructor(private signingPublicKey: Buffer) {
    super(EcdsaRAccountContractArtifact as ContractArtifact);
  }

  getDeploymentArgs() {
    return [this.signingPublicKey.subarray(0, 32), this.signingPublicKey.subarray(32, 64)];
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new SSHEcdsaAuthWitnessProvider(this.signingPublicKey);
  }
}

/** Creates auth witnesses using ECDSA signatures. */
class SSHEcdsaAuthWitnessProvider implements AuthWitnessProvider {
  constructor(private signingPublicKey: Buffer) {}

  async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    // Key type and curve name
    const keyType = Buffer.from('ecdsa-sha2-nistp256');
    const curveName = Buffer.from('nistp256');
    const signature = await signWithAgent(keyType, curveName, this.signingPublicKey, messageHash.toBuffer());
    return Promise.resolve(new AuthWitness(messageHash, [...signature.r, ...signature.s]));
  }
}
