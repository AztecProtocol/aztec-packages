import { Buffer } from 'buffer';
import net from 'net';

/**
 * SSH agent protocol message type for requesting the list of identities.
 * @internal
 */
const SSH_AGENT_IDENTITIES_REQUEST = 11;

/**
 * SSH agent protocol message type for identity list response.
 * @internal
 */
const SSH_AGENT_IDENTITIES_RESPONSE = 12;

/**
 * SSH agent protocol message type for requesting a signature.
 * @internal
 */
const SSH_AGENT_SIGN_REQUEST = 13;

/**
 * SSH agent protocol message type for signature response.
 * @internal
 */
const SSH_AGENT_SIGN_RESPONSE = 14;

/**
 * Connects to the SSH agent via a Unix domain socket.
 *
 * @returns A net.Socket connected to the SSH agent
 * @throws If SSH_AUTH_SOCK environment variable is not set
 *
 * @remarks
 * This function establishes a connection to the SSH agent using the socket path
 * specified in the SSH_AUTH_SOCK environment variable. This is the standard way
 * Unix-based SSH implementations communicate with the agent.
 *
 * The SSH agent is typically started by:
 * - ssh-agent command (manual start)
 * - Desktop environment (GNOME Keyring, KDE Wallet, etc.)
 * - Terminal emulator or shell configuration
 *
 * On macOS, the system SSH agent is always running and SSH_AUTH_SOCK is set automatically.
 */
export function connectToAgent() {
  const socketPath = process.env.SSH_AUTH_SOCK;
  if (!socketPath) {
    throw new Error('SSH_AUTH_SOCK is not set');
  }
  return net.connect(socketPath);
}

/**
 * Represents an SSH key stored in the agent.
 *
 * @remarks
 * SSH agents can store multiple keys of different types. Each key has an associated
 * comment (typically the filename or a user-provided description) to help identify it.
 */
type StoredKey = {
  /**
   * The SSH key type identifier.
   *
   * @remarks
   * Common values:
   * - 'ssh-rsa': RSA keys
   * - 'ssh-ed25519': Ed25519 keys
   * - 'ecdsa-sha2-nistp256': P-256/secp256r1 keys
   * - 'ecdsa-sha2-nistp384': P-384 keys
   * - 'ecdsa-sha2-nistp521': P-521 keys
   */
  type: string;

  /**
   * The public key encoded in base64.
   *
   * @remarks
   * This is the SSH wire format for the public key, base64-encoded.
   * It includes the key type prefix and the actual key data.
   * To use with Aztec accounts, decode from base64 and parse according to the key type.
   */
  publicKey: string;

  /**
   * A human-readable comment identifying the key.
   *
   * @remarks
   * Typically the filename from which the key was loaded (e.g., 'id_ecdsa', 'yubikey'),
   * or a custom comment added with ssh-keygen or ssh-add.
   */
  comment: string;
};

/**
 * Retrieves all identities (keys) currently loaded in the SSH agent.
 *
 * @returns A promise resolving to an array of {@link StoredKey} objects
 * @throws If SSH_AUTH_SOCK is not set or the SSH agent is not accessible
 * @throws If the SSH agent returns an unexpected response
 *
 * @remarks
 * This function queries the SSH agent for all loaded keys. It's useful for:
 * - Discovering available keys for account creation
 * - Verifying a specific key is loaded before attempting to sign
 * - Listing hardware security keys attached to the system
 *
 * The returned public keys are in SSH wire format and must be parsed to extract
 * the raw key material for use with ECDSA account contracts.
 *
 * @example
 * ```typescript
 * import { getIdentities } from '@aztec/accounts/utils';
 *
 * // List all keys in the SSH agent
 * const identities = await getIdentities();
 * console.log('Available keys:');
 * identities.forEach(key => {
 *   console.log(`  ${key.type}: ${key.comment}`);
 * });
 *
 * // Find a P-256 key for use with ECDSA R account
 * const p256Key = identities.find(k => k.type === 'ecdsa-sha2-nistp256');
 * if (!p256Key) {
 *   throw new Error('No P-256 key found in SSH agent');
 * }
 * ```
 */
export function getIdentities(): Promise<StoredKey[]> {
  return new Promise((resolve, reject) => {
    const stream = connectToAgent();
    stream.on('connect', () => {
      const request = Buffer.concat([
        Buffer.from([0, 0, 0, 5 + 4]), // length
        Buffer.from([SSH_AGENT_IDENTITIES_REQUEST]),
        Buffer.from([0, 0, 0, 0]), // flags
      ]);

      stream.write(request);
    });

    stream.on('data', data => {
      const responseType = data[4];
      if (responseType === SSH_AGENT_IDENTITIES_RESPONSE) {
        let offset = 5;
        const numKeys = data.readUInt32BE(offset);
        offset += 4;

        const keys = [];
        for (let i = 0; i < numKeys; i++) {
          const keyLength = data.readUInt32BE(offset);
          offset += 4;
          const key = data.subarray(offset, offset + keyLength);
          offset += keyLength;
          const commentLength = data.readUInt32BE(offset);
          offset += 4;
          const comment = data.subarray(offset, offset + commentLength);
          offset += commentLength;

          let keyOffset = 0;
          const typeLen = key.readUInt32BE(keyOffset);
          keyOffset += 4;
          const type = key.subarray(keyOffset, keyOffset + typeLen);

          keys.push({
            type: type.toString('ascii'),
            publicKey: key.toString('base64'),
            comment: comment.toString('utf8'),
          });
        }
        stream.end();
        resolve(keys);
      } else {
        stream.end();
        reject(`Unexpected response type: ${responseType}`);
      }
    });
  });
}

/**
 * Signs data using a key stored in the SSH agent.
 *
 * @param keyType - The SSH key type identifier (e.g., Buffer.from('ecdsa-sha2-nistp256'))
 * @param curveName - The elliptic curve name (e.g., Buffer.from('nistp256'))
 * @param publicKey - The public key identifying which private key to use (64 bytes for ECDSA)
 * @param data - The data to sign (typically a message hash)
 * @returns A promise resolving to the raw signature data from the SSH agent
 *
 * @throws If SSH_AUTH_SOCK is not set or the SSH agent is not accessible
 * @throws If the specified key is not found in the SSH agent
 * @throws If the user denies the signature request (for hardware keys)
 * @throws If the SSH agent returns an unexpected response
 *
 * @remarks
 * This function requests a signature from the SSH agent by identifying the key via its
 * public key. The SSH agent locates the corresponding private key and generates a signature.
 *
 * For hardware-backed keys (YubiKey, Nitrokey, etc.), this operation typically requires
 * user interaction:
 * - Touching the hardware key
 * - Entering a PIN
 * - Biometric authentication
 *
 * The signature format depends on the key type:
 * - For 'ecdsa-sha2-nistp256': Returns ASN.1 DER encoded ECDSA signature (r, s)
 * - For 'ssh-ed25519': Returns Ed25519 signature
 * - For 'ssh-rsa': Returns RSA signature
 *
 * The returned signature is in SSH agent wire format and must be parsed before use.
 * For ECDSA signatures, see {@link SSHEcdsaRAuthWitnessProvider.parseECDSASignature}.
 *
 * @example
 * ```typescript
 * import { signWithAgent, getIdentities } from '@aztec/accounts/utils';
 *
 * // Get a P-256 key from the SSH agent
 * const identities = await getIdentities();
 * const p256Key = identities.find(k => k.type === 'ecdsa-sha2-nistp256');
 * const publicKey = Buffer.from(p256Key.publicKey, 'base64');
 *
 * // Sign a message hash
 * const keyType = Buffer.from('ecdsa-sha2-nistp256');
 * const curveName = Buffer.from('nistp256');
 * const messageHash = Buffer.from('...'); // 32 bytes
 *
 * const signature = await signWithAgent(keyType, curveName, publicKey, messageHash);
 * // signature is now the raw SSH agent response that must be parsed
 * ```
 *
 * @internal This function is primarily used by {@link EcdsaRSSHAccountContract}
 */
export function signWithAgent(keyType: Buffer, curveName: Buffer, publicKey: Buffer, data: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    const stream = connectToAgent();
    stream.on('connect', () => {
      // Construct the key blob
      const keyBlob = Buffer.concat([
        Buffer.from([0, 0, 0, keyType.length]),
        keyType,
        Buffer.from([0, 0, 0, curveName.length]),
        curveName,
        Buffer.from([0, 0, 0, publicKey.length + 1, 4]),
        publicKey,
      ]);
      const request = Buffer.concat([
        Buffer.from([0, 0, 0, 5 + keyBlob.length + 4 + data.length + 4]), // length
        Buffer.from([SSH_AGENT_SIGN_REQUEST]),
        Buffer.from([0, 0, 0, keyBlob.length]), // key blob length
        keyBlob,
        Buffer.from([0, 0, 0, data.length]), // data length
        data,
        Buffer.from([0, 0, 0, 0]), // flags
      ]);

      stream.write(request);
    });

    stream.on('data', data => {
      const type = data[4];

      if (type === SSH_AGENT_SIGN_RESPONSE) {
        const signatureLength = data.readUInt32BE(5);
        const signature = data.subarray(9, 9 + signatureLength);
        stream.end();
        resolve(signature);
      } else {
        stream.end();
        reject(`Unexpected response type: ${type}`);
      }
    });
  });
}
