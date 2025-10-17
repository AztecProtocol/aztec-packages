import type { AuthWitnessProvider } from '@aztec/aztec.js/account';
import { EcdsaSignature } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { CompleteAddress } from '@aztec/stdlib/contract';

import { DefaultAccountContract } from '../../defaults/account_contract.js';
import { signWithAgent } from '../../utils/ssh_agent.js';

/**
 * The order of the secp256r1 (P-256) curve.
 *
 * @remarks
 * This constant is used to ensure ECDSA signatures have a low S value, which is required
 * for the signature to be used as a nullifier in Aztec's protocol. Values of S greater
 * than n/2 are negated to ensure canonical signature representation.
 */
const secp256r1N = 115792089210356248762697446949407573529996955224135760342422259061068512044369n;

/**
 * Base class for SSH-delegated ECDSA R account contracts using secp256r1 signatures.
 *
 * @remarks
 * This specialized account contract implementation delegates ECDSA signing operations to an
 * SSH agent, enabling integration with:
 * - Hardware security keys (YubiKey, Nitrokey, etc.)
 * - SSH agents managing secp256r1 keys
 * - Hardware-backed key storage via SSH
 * - Remote signing infrastructure
 *
 * Unlike standard ECDSA R accounts, this implementation:
 * - Takes a public key instead of a private key (private key remains in the SSH agent)
 * - Delegates all signing operations to an SSH agent via the SSH_AUTH_SOCK socket
 * - Never exposes the private key to the application
 * - Provides hardware-backed security without custom integrations
 *
 * The account stores the secp256r1 public key in an immutable encrypted note during deployment.
 * When authentication is needed, the signature request is forwarded to the SSH agent, which
 * performs the signing operation (potentially requiring user interaction for hardware keys).
 *
 * Requirements:
 * - SSH agent must be running and accessible via SSH_AUTH_SOCK environment variable
 * - The secp256r1 key must be loaded in the SSH agent
 * - Key type must be 'ecdsa-sha2-nistp256'
 *
 * Security considerations:
 * - Private key never leaves the SSH agent or hardware device
 * - Each signature may require user interaction (e.g., touching a YubiKey)
 * - SSH agent access control applies (socket permissions, agent forwarding rules)
 * - Signatures are normalized to low-S form for Aztec compatibility
 *
 * This is an abstract base class that doesn't specify how to load the contract artifact.
 * Use {@link EcdsaRSSHAccountContract} for eager loading or the lazy variant for dynamic imports.
 *
 * @see {@link EcdsaRBaseAccountContract} for standard secp256r1 signing with private keys
 * @see {@link signWithAgent} for SSH agent integration details
 */
export abstract class EcdsaRSSHBaseAccountContract extends DefaultAccountContract {
  /**
   * Creates a new SSH-delegated ECDSA R account contract instance.
   *
   * @param signingPublicKey - The secp256r1 public key (64 bytes: 32-byte x + 32-byte y coordinates)
   *
   * @remarks
   * The public key identifies which key in the SSH agent should be used for signing.
   * It must match a key already loaded in the SSH agent. To list available keys, use
   * the {@link getIdentities} utility function.
   *
   * The public key format is uncompressed (x and y coordinates, 64 bytes total),
   * without the 0x04 prefix byte used in some elliptic curve encodings.
   */
  constructor(private signingPublicKey: Buffer) {
    super();
  }

  /**
   * Retrieves the initialization function name and arguments for deploying the account contract.
   *
   * @returns The constructor name and arguments, including the public key coordinates
   *
   * @remarks
   * This method splits the public key into two 32-byte components (x and y coordinates)
   * for storage in the contract. The public key is stored in an encrypted note, ensuring
   * privacy while allowing the account to verify signatures on-chain.
   *
   * Since this implementation uses SSH agent delegation, only the public key is needed
   * for initialization - the private key remains secure in the SSH agent.
   */
  getInitializationFunctionAndArgs() {
    return Promise.resolve({
      constructorName: 'constructor',
      constructorArgs: [this.signingPublicKey.subarray(0, 32), this.signingPublicKey.subarray(32, 64)],
    });
  }

  /**
   * Creates an SSH-delegated authentication witness provider for this account.
   *
   * @param _address - The complete address of the account (unused in this implementation)
   * @returns An {@link AuthWitnessProvider} that delegates signing to an SSH agent
   *
   * @remarks
   * The auth witness provider communicates with the SSH agent to generate signatures.
   * Each signature request may require user interaction if the key is stored on a
   * hardware device (e.g., touching a YubiKey or entering a PIN).
   */
  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new SSHEcdsaRAuthWitnessProvider(this.signingPublicKey);
  }
}

/**
 * Authentication witness provider that delegates ECDSA signing to an SSH agent.
 *
 * @remarks
 * This class implements the {@link AuthWitnessProvider} interface to generate authentication
 * witnesses by delegating signature operations to an SSH agent. It communicates with the
 * SSH agent via the SSH_AUTH_SOCK Unix socket.
 *
 * The provider:
 * - Formats signature requests according to the SSH agent protocol
 * - Parses SSH agent responses containing ECDSA signatures
 * - Normalizes signatures to low-S form required by Aztec
 * - Handles ASN.1 DER encoding used by SSH agents
 *
 * @internal
 */
class SSHEcdsaRAuthWitnessProvider implements AuthWitnessProvider {
  constructor(private signingPublicKey: Buffer) {}

  /**
   * Parses an ECDSA signature from SSH agent response data.
   *
   * @param data - Raw signature data returned by the SSH agent
   * @returns An {@link EcdsaSignature} with normalized low-S value
   *
   * @throws If the signature type is not 'ecdsa-sha2-nistp256'
   *
   * @remarks
   * SSH agents return signatures in their own binary format:
   * 1. Signature type string length (4 bytes)
   * 2. Signature type string ('ecdsa-sha2-nistp256')
   * 3. Signature blob length (4 bytes)
   * 4. R value length (4 bytes)
   * 5. R value (variable length, ASN.1 DER encoded)
   * 6. S value length (4 bytes)
   * 7. S value (variable length, ASN.1 DER encoded)
   *
   * ASN.1 DER encoding may add a leading zero byte to prevent negative interpretation.
   * This method strips those bytes to get the raw 32-byte values.
   *
   * The S value is normalized to low-S form (s <= n/2) as required by Aztec's protocol.
   * High-S signatures are converted by computing s' = n - s, where n is the curve order.
   * This ensures signatures can be used as nullifiers and prevents signature malleability.
   */
  #parseECDSASignature(data: Buffer) {
    // Extract ECDSA signature components
    let offset = 0;
    const sigTypeLen = data.readUInt32BE(offset);
    offset += 4;
    const sigType = data.subarray(offset, offset + sigTypeLen).toString();
    offset += sigTypeLen;

    if (sigType !== 'ecdsa-sha2-nistp256') {
      throw new Error(`Unexpected signature type: ${sigType}`);
    }

    offset += 4;
    const rLen = data.readUInt32BE(offset);
    offset += 4;
    let r = data.subarray(offset, offset + rLen);
    offset += rLen;

    const sLen = data.readUInt32BE(offset);
    offset += 4;
    let s = data.subarray(offset, offset + sLen);

    // R and S are encoded using ASN.1 DER format, which may include a leading zero byte to avoid interpreting the value as negative
    if (r.length > 32) {
      r = Buffer.from(Uint8Array.prototype.slice.call(r, 1));
    }

    if (s.length > 32) {
      s = Buffer.from(Uint8Array.prototype.slice.call(s, 1));
    }

    const maybeHighS = BigInt(`0x${s.toString('hex')}`);

    // ECDSA signatures must have a low S value so they can be used as a nullifier. BB forces a value of 27 for v, so
    // only one PublicKey can verify the signature (and not its negated counterpart) https://ethereum.stackexchange.com/a/55728
    if (maybeHighS > secp256r1N / 2n + 1n) {
      s = Buffer.from((secp256r1N - maybeHighS).toString(16), 'hex');
    }

    return new EcdsaSignature(r, s, Buffer.from([0]));
  }

  /**
   * Creates an authentication witness by requesting a signature from the SSH agent.
   *
   * @param messageHash - The hash of the message to sign
   * @returns A promise resolving to an {@link AuthWitness} containing the signature
   *
   * @throws If SSH_AUTH_SOCK is not set or the SSH agent is not accessible
   * @throws If the key is not found in the SSH agent
   * @throws If the user denies the signature request (for hardware keys)
   * @throws If the signature type is unexpected
   *
   * @remarks
   * This method delegates signing to an SSH agent:
   * 1. Connects to the SSH agent via SSH_AUTH_SOCK socket
   * 2. Sends a signature request identifying the key by its public key
   * 3. Waits for the SSH agent to generate the signature (may require user interaction)
   * 4. Parses and normalizes the returned signature
   * 5. Wraps it in an {@link AuthWitness}
   *
   * For hardware-backed keys (YubiKey, etc.), this operation may:
   * - Require the user to touch the hardware key
   * - Prompt for a PIN on the device
   * - Time out if user interaction is not completed
   *
   * The signature can be used to:
   * - Authenticate transaction execution requests
   * - Authorize token transfers or contract calls on behalf of the account
   * - Prove ownership of the account without the private key leaving the hardware
   */
  async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    // Key type and curve name
    const keyType = Buffer.from('ecdsa-sha2-nistp256');
    const curveName = Buffer.from('nistp256');
    const data = await signWithAgent(keyType, curveName, this.signingPublicKey, messageHash.toBuffer());
    const signature = this.#parseECDSASignature(data);

    return new AuthWitness(messageHash, [...signature.r, ...signature.s]);
  }
}
