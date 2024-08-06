import { type AuthWitnessProvider } from '@aztec/aztec.js/account';
import { AuthWitness, type CompleteAddress } from '@aztec/circuit-types';
import { EcdsaSignature } from '@aztec/circuits.js/barretenberg';
import { type ContractArtifact } from '@aztec/foundation/abi';
import { type Fr } from '@aztec/foundation/fields';

import { DefaultAccountContract } from '../../defaults/account_contract.js';
import { signWithAgent } from '../../utils/ssh_agent.js';
import { EcdsaRAccountContractArtifact } from './artifact.js';

/**
 * Account contract that authenticates transactions using ECDSA signatures
 * verified against a secp256r1 public key stored in an immutable encrypted note.
 * Since this implementation relays signatures to an SSH agent, we provide the
 * public key here not for signature verification, but to identify actual identity
 * that will be used to sign authwitnesses.
 */
export class EcdsaRSSHAccountContract extends DefaultAccountContract {
  constructor(private signingPublicKey: Buffer) {
    super(EcdsaRAccountContractArtifact as ContractArtifact);
  }

  getDeploymentArgs() {
    return [this.signingPublicKey.subarray(0, 32), this.signingPublicKey.subarray(32, 64)];
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new SSHEcdsaRAuthWitnessProvider(this.signingPublicKey);
  }
}

/** Creates auth witnesses using ECDSA signatures. */
class SSHEcdsaRAuthWitnessProvider implements AuthWitnessProvider {
  constructor(private signingPublicKey: Buffer) {}

  #parseECDSASignature(data: Buffer) {
    // Extract ECDSA signature components
    let offset = 0;
    const sigTypeLen = data.readUInt32BE(offset);
    offset += 4;
    const sigType = data.slice(offset, offset + sigTypeLen).toString();
    offset += sigTypeLen;

    if (sigType !== 'ecdsa-sha2-nistp256') {
      throw new Error(`Unexpected signature type: ${sigType}`);
    }

    offset += 4;
    const rLen = data.readUInt32BE(offset);
    offset += 4;
    let r = data.slice(offset, offset + rLen);
    offset += rLen;

    const sLen = data.readUInt32BE(offset);
    offset += 4;
    let s = data.slice(offset, offset + sLen);

    if (r.length > 32) {
      r = r.slice(1);
    }

    if (s.length > 32) {
      s = s.slice(1);
    }
    return new EcdsaSignature(r, s, Buffer.from([0]));
  }

  async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    // Key type and curve name
    const keyType = Buffer.from('ecdsa-sha2-nistp256');
    const curveName = Buffer.from('nistp256');
    const data = await signWithAgent(keyType, curveName, this.signingPublicKey, messageHash.toBuffer());
    const signature = this.#parseECDSASignature(data);

    return Promise.resolve(new AuthWitness(messageHash, [...signature.r, ...signature.s]));
  }
}
