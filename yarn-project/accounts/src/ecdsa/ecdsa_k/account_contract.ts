import type { AuthWitnessProvider } from '@aztec/aztec.js/account';
import { Ecdsa } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { CompleteAddress } from '@aztec/stdlib/contract';

import { DefaultAccountContract } from '../../defaults/account_contract.js';

/**
 * Base class for ECDSA K account contracts that use secp256k1 curve signatures for authentication.
 *
 * @remarks
 * This account contract implementation provides ECDSA-based authentication using the secp256k1 elliptic curve,
 * which is the same curve used by Bitcoin and Ethereum. This makes it ideal for:
 * - Cross-chain integrations with Ethereum wallets (MetaMask, WalletConnect, etc.)
 * - Scenarios where users already have secp256k1 keys
 * - Applications requiring compatibility with existing Ethereum tooling
 *
 * The account stores the secp256k1 public key in an immutable encrypted note during deployment.
 * All transaction authentication is performed by verifying ECDSA signatures against this stored public key.
 *
 * Security considerations:
 * - Uses the secp256k1 curve (same as Ethereum) which has ~128 bits of security
 * - Private key must be kept secure; compromise allows full account control
 * - Signatures are deterministic (RFC 6979) to prevent nonce reuse attacks
 * - The public key is stored encrypted to maintain privacy
 *
 * This is an abstract base class that doesn't specify how to load the contract artifact.
 * Use {@link EcdsaKAccountContract} for eager loading or the lazy variant for dynamic imports.
 *
 * @see {@link EcdsaRBaseAccountContract} for secp256r1 (P-256) curve alternative
 * @see {@link SchnorrBaseAccountContract} for Grumpkin-based Schnorr signatures (recommended for Aztec-native applications)
 */
export abstract class EcdsaKBaseAccountContract extends DefaultAccountContract {
  /**
   * Creates a new ECDSA K account contract instance.
   *
   * @param signingPrivateKey - The secp256k1 private key used for signing transactions (32 bytes)
   *
   * @remarks
   * The private key should be:
   * - Randomly generated using a cryptographically secure random number generator
   * - Stored securely (e.g., in a hardware wallet, encrypted keystore, or secure enclave)
   * - Never exposed or transmitted over insecure channels
   * - Backed up securely to prevent loss of account access
   */
  constructor(private signingPrivateKey: Buffer) {
    super();
  }

  /**
   * Retrieves the initialization function name and arguments for deploying the account contract.
   *
   * @returns The constructor name and arguments, including the public key coordinates
   *
   * @remarks
   * This method computes the secp256k1 public key from the private key and splits it into
   * two 32-byte components (x and y coordinates) for storage in the contract.
   * The public key is stored in an encrypted note, ensuring privacy while allowing
   * the account to verify signatures on-chain.
   */
  async getInitializationFunctionAndArgs() {
    const signingPublicKey = await new Ecdsa().computePublicKey(this.signingPrivateKey);
    return {
      constructorName: 'constructor',
      constructorArgs: [signingPublicKey.subarray(0, 32), signingPublicKey.subarray(32, 64)],
    };
  }

  /**
   * Creates an authentication witness provider for this account.
   *
   * @param _address - The complete address of the account (unused in this implementation)
   * @returns An {@link AuthWitnessProvider} that creates ECDSA signatures
   *
   * @remarks
   * The auth witness provider is responsible for generating cryptographic proofs that
   * authenticate transactions and authorization witnesses. It signs message hashes using
   * the account's secp256k1 private key.
   */
  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new EcdsaKAuthWitnessProvider(this.signingPrivateKey);
  }
}

/**
 * Authentication witness provider that creates ECDSA signatures using the secp256k1 curve.
 *
 * @remarks
 * This class implements the {@link AuthWitnessProvider} interface to generate authentication
 * witnesses (signatures) for transactions and authorization requests. It uses the ECDSA
 * signature algorithm with the secp256k1 elliptic curve.
 *
 * The signature format includes:
 * - r: The x-coordinate of the signature point (32 bytes)
 * - s: The scalar value of the signature (32 bytes)
 *
 * Signatures are deterministic (following RFC 6979) to prevent nonce reuse vulnerabilities.
 *
 * @internal
 */
class EcdsaKAuthWitnessProvider implements AuthWitnessProvider {
  constructor(private signingPrivateKey: Buffer) {}

  /**
   * Creates an authentication witness by signing a message hash.
   *
   * @param messageHash - The hash of the message to sign
   * @returns A promise resolving to an {@link AuthWitness} containing the signature
   *
   * @remarks
   * This method generates an ECDSA signature over the provided message hash using the
   * secp256k1 private key. The signature components (r and s) are concatenated and
   * wrapped in an {@link AuthWitness} object.
   *
   * The signature can be used to:
   * - Authenticate transaction execution requests
   * - Authorize token transfers or contract calls on behalf of the account
   * - Prove ownership of the account without revealing the private key
   *
   * @throws If the private key is invalid or signature generation fails
   */
  async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    const ecdsa = new Ecdsa();
    const signature = await ecdsa.constructSignature(messageHash.toBuffer(), this.signingPrivateKey);
    return Promise.resolve(new AuthWitness(messageHash, [...signature.r, ...signature.s]));
  }
}
