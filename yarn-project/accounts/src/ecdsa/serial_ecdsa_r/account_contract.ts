import type { AuthWitnessProvider } from '@aztec/aztec.js/account';
import { EcdsaSignature, sha256 } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { CompleteAddress } from '@aztec/stdlib/contract';

import { DefaultAccountContract } from '../../defaults/account_contract.js';
import { CommandType, sendCommandAndParseResponse } from '../../utils/web_serial.js';

const secp256r1N = 115792089210356248762697446949407573529996955224135760342422259061068512044369n;
/**
 * Account contract that authenticates transactions using ECDSA signatures
 * verified against a secp256r1 public key stored in an immutable encrypted note.
 * Since this implementation relays signatures to an Serial agent, we provide the
 * public key here not for signature verification, but to identify actual identity
 * that will be used to sign authwitnesses.
 * This abstract version does not provide a way to retrieve the artifact, as it
 * can be implemented with or without lazy loading.
 */
export abstract class EcdsaRSerialBaseAccountContract extends DefaultAccountContract {
  constructor(private signingPublicKey: Buffer) {
    super();
  }

  getDeploymentFunctionAndArgs() {
    return Promise.resolve({
      constructorName: 'constructor',
      constructorArgs: [this.signingPublicKey.subarray(0, 32), this.signingPublicKey.subarray(32, 64)],
    });
  }

  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new SerialEcdsaRAuthWitnessProvider(this.signingPublicKey);
  }
}

/** Creates auth witnesses using ECDSA signatures. */
class SerialEcdsaRAuthWitnessProvider implements AuthWitnessProvider {
  constructor(private signingPublicKey: Buffer) {}

  #parseECDSASignature(data: number[]) {
    // Extract ECDSA signature components
    const r = Buffer.from(data.slice(0, 32));
    let s = Buffer.from(data.slice(32, 64));

    const maybeHighS = BigInt(`0x${s.toString('hex')}`);

    // ECDSA signatures must have a low S value so they can be used as a nullifier. BB forces a value of 27 for v, so
    // only one PublicKey can verify the signature (and not its negated counterpart) https://ethereum.stackexchange.com/a/55728
    if (maybeHighS > secp256r1N / 2n + 1n) {
      s = Buffer.from((secp256r1N - maybeHighS).toString(16), 'hex');
    }

    return new EcdsaSignature(r, s, Buffer.from([0]));
  }

  async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    const signRequest = {
      type: CommandType.SIGNATURE_REQUEST,
      data: {
        index: 0,
        pk: Array.from(this.signingPublicKey),
        msg: Array.from(sha256(messageHash.toBuffer())),
      },
    };

    const response = await sendCommandAndParseResponse(signRequest);

    if (response.type !== CommandType.SIGNATURE_ACCEPTED_RESPONSE) {
      throw new Error(
        `Unexpected response type from HW wallet: ${response.type}. Expected ${CommandType.SIGNATURE_ACCEPTED_RESPONSE}`,
      );
    }

    const signature = this.#parseECDSASignature(response.data.signature);
    return new AuthWitness(messageHash, [...signature.r, ...signature.s]);
  }
}
