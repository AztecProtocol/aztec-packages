import type { AuthWitnessProvider } from '@aztec/aztec.js/account';
import { Schnorr } from '@aztec/foundation/crypto';
import { Fr, GrumpkinScalar } from '@aztec/foundation/fields';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { CompleteAddress } from '@aztec/stdlib/contract';

import { DefaultAccountContract } from '../defaults/account_contract.js';

/**
 * Base class for Schnorr account contracts using Grumpkin curve signatures for authentication.
 *
 * @remarks
 * This is the recommended account contract implementation for Aztec-native applications.
 * It uses Schnorr signatures over the Grumpkin elliptic curve, which is specifically
 * designed for efficient zero-knowledge proof generation in Aztec.
 *
 * Advantages over ECDSA accounts:
 * - Smaller proof sizes due to native Grumpkin support
 * - Lower verification costs in circuits
 * - Simpler key derivation using Aztec's native key scheme
 * - Better integration with Aztec's cryptographic primitives
 * - Optimized for zero-knowledge proofs
 *
 * The account stores the Grumpkin public key in an immutable encrypted note during deployment.
 * All transaction authentication is performed by verifying Schnorr signatures against this stored public key.
 *
 * Security considerations:
 * - Uses the Grumpkin curve which provides ~128 bits of security
 * - Private key must be kept secure; compromise allows full account control
 * - Signatures are deterministic to prevent nonce reuse attacks
 * - The public key is stored encrypted to maintain privacy
 * - Native to Aztec's cryptographic stack for optimal security
 *
 * Comparison with ECDSA:
 * - Schnorr: Better for Aztec-native apps, smaller proofs, faster verification
 * - ECDSA: Better for Ethereum integration, hardware wallet support
 *
 * This is an abstract base class that doesn't specify how to load the contract artifact.
 * Use {@link SchnorrAccountContract} for eager loading or the lazy variant for dynamic imports.
 *
 * @see {@link EcdsaKBaseAccountContract} for secp256k1 (Ethereum-compatible) alternative
 * @see {@link EcdsaRBaseAccountContract} for secp256r1 (NIST-compliant) alternative
 */
export abstract class SchnorrBaseAccountContract extends DefaultAccountContract {
  /**
   * Creates a new Schnorr account contract instance.
   *
   * @param signingPrivateKey - The Grumpkin scalar private key used for signing transactions
   *
   * @remarks
   * The private key should be:
   * - Derived using Aztec's key derivation scheme (recommended)
   * - Or randomly generated using a cryptographically secure random number generator
   * - Stored securely (encrypted keystore, hardware wallet, or secure enclave)
   * - Never exposed or transmitted over insecure channels
   * - Backed up securely to prevent loss of account access
   *
   * For Aztec-native key derivation, use {@link deriveSigningKey} from `@aztec/stdlib/keys`.
   */
  constructor(private signingPrivateKey: GrumpkinScalar) {
    super();
  }

  /**
   * Retrieves the initialization function name and arguments for deploying the account contract.
   *
   * @returns The constructor name and arguments, including the public key coordinates
   *
   * @remarks
   * This method computes the Grumpkin public key from the private key and provides both
   * x and y coordinates for storage in the contract. The public key is stored in an
   * encrypted note, ensuring privacy while allowing the account to verify signatures on-chain.
   */
  async getInitializationFunctionAndArgs() {
    const signingPublicKey = await new Schnorr().computePublicKey(this.signingPrivateKey);
    return { constructorName: 'constructor', constructorArgs: [signingPublicKey.x, signingPublicKey.y] };
  }

  /**
   * Creates an authentication witness provider for this account.
   *
   * @param _address - The complete address of the account (unused in this implementation)
   * @returns An {@link AuthWitnessProvider} that creates Schnorr signatures
   *
   * @remarks
   * The auth witness provider is responsible for generating cryptographic proofs that
   * authenticate transactions and authorization witnesses. It signs message hashes using
   * the account's Grumpkin private key with the Schnorr signature scheme.
   */
  getAuthWitnessProvider(_address: CompleteAddress): AuthWitnessProvider {
    return new SchnorrAuthWitnessProvider(this.signingPrivateKey);
  }
}

/**
 * Authentication witness provider that creates Schnorr signatures using the Grumpkin curve.
 *
 * @remarks
 * This class implements the {@link AuthWitnessProvider} interface to generate authentication
 * witnesses (signatures) for transactions and authorization requests. It uses the Schnorr
 * signature algorithm over the Grumpkin elliptic curve.
 *
 * Schnorr signatures provide:
 * - Linearity properties useful for aggregation
 * - Provable security under standard assumptions
 * - Simpler implementation than ECDSA
 * - Better performance in zero-knowledge circuits
 *
 * The signature format is a 64-byte value containing the signature data optimized
 * for verification in Aztec's circuits.
 */
export class SchnorrAuthWitnessProvider implements AuthWitnessProvider {
  constructor(private signingPrivateKey: GrumpkinScalar) {}

  /**
   * Creates an authentication witness by signing a message hash.
   *
   * @param messageHash - The hash of the message to sign
   * @returns A promise resolving to an {@link AuthWitness} containing the signature
   *
   * @remarks
   * This method generates a Schnorr signature over the provided message hash using the
   * Grumpkin private key. The signature is wrapped in an {@link AuthWitness} object.
   *
   * The signature can be used to:
   * - Authenticate transaction execution requests
   * - Authorize token transfers or contract calls on behalf of the account
   * - Prove ownership of the account without revealing the private key
   *
   * Schnorr signatures are deterministic, preventing nonce reuse vulnerabilities that
   * can occur with improper ECDSA implementations.
   *
   * @throws If the private key is invalid or signature generation fails
   */
  async createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    const schnorr = new Schnorr();
    const signature = await schnorr.constructSignature(messageHash.toBuffer(), this.signingPrivateKey);
    return new AuthWitness(messageHash, [...signature.toBuffer()]);
  }
}
