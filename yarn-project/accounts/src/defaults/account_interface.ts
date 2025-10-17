import type { AccountInterface, AuthWitnessProvider } from '@aztec/aztec.js/account';
import { DefaultAccountEntrypoint, type DefaultAccountEntrypointOptions } from '@aztec/entrypoints/account';
import type { ChainInfo, EntrypointInterface } from '@aztec/entrypoints/interfaces';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { CompleteAddress } from '@aztec/stdlib/contract';
import type { GasSettings } from '@aztec/stdlib/gas';
import type { TxExecutionRequest } from '@aztec/stdlib/tx';

/**
 * Default implementation of the account interface for standard Aztec accounts.
 *
 * @remarks
 * This class provides the standard account interface implementation for accounts that use
 * the default entrypoint signature. The default entrypoint accepts:
 * - AppPayload: Contains the function calls to execute
 * - FeePayload: Contains fee payment information
 *
 * These payload types are defined in the Aztec Noir standard library's entrypoint module.
 *
 * The account interface is the primary way applications interact with accounts:
 * - Creating transaction execution requests with proper authentication
 * - Generating authorization witnesses for cross-contract calls
 * - Accessing account address and chain information
 *
 * This implementation wraps a {@link DefaultAccountEntrypoint} which handles:
 * - Transaction payload construction
 * - Signature aggregation
 * - Nonce management
 * - Fee calculation
 *
 * @see {@link DefaultAccountContract} for the corresponding contract implementation
 * @see {@link DefaultAccountEntrypoint} for entrypoint payload handling
 */
export class DefaultAccountInterface implements AccountInterface {
  /** The entrypoint implementation handling transaction creation */
  protected entrypoint: EntrypointInterface;

  private chainId: Fr;
  private version: Fr;

  /**
   * Creates a new default account interface.
   *
   * @param authWitnessProvider - Provider for creating authentication witnesses
   * @param address - The complete address of the account (address + public keys)
   * @param chainInfo - Chain configuration (chain ID and version)
   *
   * @remarks
   * The auth witness provider must match the authentication mechanism used by the
   * account contract on-chain. For example, an ECDSA account contract requires an
   * ECDSA auth witness provider.
   */
  constructor(
    private authWitnessProvider: AuthWitnessProvider,
    private address: CompleteAddress,
    chainInfo: ChainInfo,
  ) {
    this.entrypoint = new DefaultAccountEntrypoint(
      address.address,
      authWitnessProvider,
      chainInfo.chainId.toNumber(),
      chainInfo.version.toNumber(),
    );
    this.chainId = chainInfo.chainId;
    this.version = chainInfo.version;
  }

  /**
   * Creates a transaction execution request with authentication.
   *
   * @param exec - The execution payload containing function calls to execute
   * @param gasSettings - Gas limits and fee payment configuration
   * @param options - Additional options for the entrypoint (nonce, fee payment method, etc.)
   * @returns A promise resolving to a signed transaction execution request
   *
   * @remarks
   * This method:
   * 1. Constructs the transaction payload from the execution and fee information
   * 2. Generates authentication witnesses (signatures) for the transaction
   * 3. Packages everything into a {@link TxExecutionRequest} ready for submission
   *
   * The returned transaction can be sent to the PXE for simulation and submission to the network.
   */
  createTxExecutionRequest(
    exec: ExecutionPayload,
    gasSettings: GasSettings,
    options: DefaultAccountEntrypointOptions,
  ): Promise<TxExecutionRequest> {
    return this.entrypoint.createTxExecutionRequest(exec, gasSettings, options);
  }

  /**
   * Creates an authentication witness for a message hash.
   *
   * @param messageHash - The hash of the message to authenticate
   * @returns A promise resolving to an authentication witness
   *
   * @remarks
   * Authentication witnesses are used for:
   * - Authorizing token transfers from the account
   * - Permitting other contracts to act on behalf of the account
   * - Proving ownership for cross-contract calls
   *
   * The witness format depends on the account's authentication mechanism:
   * - ECDSA accounts: Signature (r, s) components
   * - Schnorr accounts: Signature data
   * - Multisig accounts: Multiple signatures
   */
  createAuthWit(messageHash: Fr): Promise<AuthWitness> {
    return this.authWitnessProvider.createAuthWit(messageHash);
  }

  /**
   * Gets the complete address of the account.
   *
   * @returns The complete address including public keys
   *
   * @remarks
   * The complete address contains:
   * - The account's Aztec address
   * - Public keys for encryption and tagging
   * - Partial address for deployment
   */
  getCompleteAddress(): CompleteAddress {
    return this.address;
  }

  /**
   * Gets the Aztec address of the account.
   *
   * @returns The account's address
   *
   * @remarks
   * This is the primary identifier for the account used in transactions and contracts.
   */
  getAddress(): AztecAddress {
    return this.address.address;
  }

  /**
   * Gets the chain ID for this account.
   *
   * @returns The chain ID as a field element
   *
   * @remarks
   * The chain ID is included in transaction signatures to prevent replay attacks
   * across different Aztec networks (mainnet, testnet, local devnet, etc.).
   */
  getChainId(): Fr {
    return this.chainId;
  }

  /**
   * Gets the protocol version for this account.
   *
   * @returns The protocol version as a field element
   *
   * @remarks
   * The version is included in transaction signatures to ensure transactions are
   * only valid for the intended protocol version, preventing issues during upgrades.
   */
  getVersion(): Fr {
    return this.version;
  }
}
