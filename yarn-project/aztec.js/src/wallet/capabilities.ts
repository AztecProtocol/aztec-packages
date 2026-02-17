import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { Aliased } from './wallet.js';

/**
 * Current capability manifest version.
 */
export const CAPABILITY_VERSION = '1.0' as const;

/**
 * Pattern for matching contract functions with wildcards.
 *
 * Used in simulation and transaction capabilities to specify which
 * contract functions are allowed.
 *
 * @example
 * // Allow any function on a specific contract
 * \{ contract: ammAddress, function: '*' \}
 *
 * @example
 * // Allow only 'swap' function on a specific contract
 * \{ contract: ammAddress, function: 'swap' \}
 *
 * @example
 * // Allow 'transfer' on any contract
 * \{ contract: '*', function: 'transfer' \}
 */
export interface ContractFunctionPattern {
  /** Contract address or '*' for any contract */
  contract: AztecAddress | '*';

  /** Function name or '*' for any function */
  function: string;
}

/**
 * Account access capability - grants access to user accounts.
 *
 * Maps to wallet methods:
 * - getAccounts (when canGet: true)
 * - createAuthWit (when canCreateAuthWit: true)
 *
 * The wallet decides which accounts to reveal to the app.
 * Apps don't specify which accounts they want - they just request
 * the capability and the wallet shows them the available accounts.
 */
export interface AccountsCapability {
  /** Discriminator for capability type */
  type: 'accounts';

  /** Can get accounts from wallet. Maps to: getAccounts */
  canGet?: boolean;

  /** Can create auth witnesses for accounts. Maps to: createAuthWit */
  canCreateAuthWit?: boolean;
}

/**
 * Granted account access capability.
 *
 * Extends the request with specific accounts that were granted by the wallet.
 */
export interface GrantedAccountsCapability extends AccountsCapability {
  /** Specific accounts granted by the wallet with their aliases. The wallet adds this when granting the capability. */
  accounts: Aliased<AztecAddress>[];
}

/**
 * Contract interaction capability - for registering and querying contracts.
 *
 * Maps to wallet methods:
 * - registerContract (when canRegister: true)
 * - getContractMetadata (when canGetMetadata: true)
 *
 * Matching is done by contract address, not class ID. This allows updating
 * existing contracts with new artifacts (e.g., when contract is upgraded
 * to a new contractClassId on-chain).
 *
 * Note: For querying contract class metadata, use ContractClassesCapability instead.
 *
 * @example
 * // Register and query specific contracts
 * \{
 *   type: 'contracts',
 *   contracts: [ammAddress, tokenAddress],
 *   canRegister: true,
 *   canGetMetadata: true
 * \}
 *
 * @example
 * // Query any contract (read-only)
 * \{
 *   type: 'contracts',
 *   contracts: '*',
 *   canGetMetadata: true
 * \}
 */
export interface ContractsCapability {
  /** Discriminator for capability type */
  type: 'contracts';

  /**
   * Which contracts this applies to:
   * - '*': Any contract address
   * - AztecAddress[]: Specific contract addresses
   */
  contracts: '*' | AztecAddress[];

  /**
   * Can register contracts and update existing registrations.
   * Maps to: registerContract
   *
   * When true, allows:
   * - Registering new contract instances at specified addresses
   * - Re-registering existing contracts with updated artifacts (e.g., after upgrade)
   */
  canRegister?: boolean;

  /** Can query contract metadata. Maps to: getContractMetadata */
  canGetMetadata?: boolean;
}

/**
 * Granted contract interaction capability.
 *
 * The wallet may reduce the scope (e.g., from '*' to specific addresses).
 */
export interface GrantedContractsCapability extends ContractsCapability {}

/**
 * Contract class capability - for querying contract class metadata.
 *
 * Maps to wallet methods:
 * - getContractClassMetadata
 *
 * Contract classes are identified by their class ID (Fr), not by contract address.
 * Multiple contract instances can share the same class. This capability grants
 * permission to query metadata for specific contract classes.
 *
 * Apps typically acquire this permission automatically when registering a contract
 * with an artifact (the wallet auto-grants permission for that contract's class ID).
 *
 * @example
 * // Query specific contract classes
 * \{
 *   type: 'contractClasses',
 *   classes: [classId1, classId2],
 *   canGetMetadata: true
 * \}
 *
 * @example
 * // Query any contract class (wildcard)
 * \{
 *   type: 'contractClasses',
 *   classes: '*',
 *   canGetMetadata: true
 * \}
 */
export interface ContractClassesCapability {
  /** Discriminator for capability type */
  type: 'contractClasses';

  /**
   * Which contract classes this applies to:
   * - '*': Any contract class ID
   * - Fr[]: Specific contract class IDs
   */
  classes: '*' | Fr[];

  /** Can query contract class metadata. Maps to: getContractClassMetadata */
  canGetMetadata: boolean;
}

/**
 * Granted contract class capability.
 *
 * The wallet may reduce the scope (e.g., from '*' to specific class IDs).
 */
export interface GrantedContractClassesCapability extends ContractClassesCapability {}

/**
 * Transaction simulation capability - for simulating transactions and utilities.
 *
 * Maps to wallet methods:
 * - simulateTx (when transactions scope specified)
 * - simulateUtility (when utilities scope specified)
 * - profileTx (when transactions scope specified)
 *
 * @example
 * // Simulate any transaction on specific contracts
 * \{
 *   type: 'simulation',
 *   transactions: \{
 *     scope: [
 *       \{ contract: ammAddress, function: '*' \},
 *       \{ contract: tokenAddress, function: 'transfer' \}
 *     ]
 *   \}
 * \}
 *
 * @example
 * // Simulate any transaction and utility call
 * \{
 *   type: 'simulation',
 *   transactions: \{ scope: '*' \},
 *   utilities: \{ scope: '*' \}
 * \}
 */
export interface SimulationCapability {
  /** Discriminator for capability type */
  type: 'simulation';

  /** Transaction simulation scope. Maps to: simulateTx, profileTx */
  transactions?: {
    /**
     * Which contracts/functions to allow:
     * - '*': Any transaction
     * - ContractFunctionPattern[]: Specific contract functions
     */
    scope: '*' | ContractFunctionPattern[];
  };

  /** Utility simulation scope (unconstrained calls). Maps to: simulateUtility */
  utilities?: {
    /**
     * Which contracts/functions to allow:
     * - '*': Any utility call
     * - ContractFunctionPattern[]: Specific contract functions
     */
    scope: '*' | ContractFunctionPattern[];
  };
}

/**
 * Granted transaction simulation capability.
 *
 * The wallet may reduce the scope (e.g., from '*' to specific patterns).
 */
export interface GrantedSimulationCapability extends SimulationCapability {}

/**
 * Transaction execution capability - for sending transactions.
 *
 * Maps to wallet methods:
 * - sendTx
 *
 * Policy enforcement (rate limits, spending limits) should be handled
 * at the contract level in Aztec, not at the wallet level.
 *
 * @example
 * // Send specific transactions with approval
 * \{
 *   type: 'transaction',
 *   scope: [
 *     \{ contract: ammAddress, function: 'swap' \},
 *     \{ contract: ammAddress, function: 'addLiquidity' \}
 *   ]
 * \}
 *
 * @example
 * // Send any transaction
 * \{
 *   type: 'transaction',
 *   scope: '*'
 * \}
 */
export interface TransactionCapability {
  /** Discriminator for capability type */
  type: 'transaction';

  /**
   * Which contracts/functions to allow:
   * - '*': Any transaction
   * - ContractFunctionPattern[]: Specific patterns
   */
  scope: '*' | ContractFunctionPattern[];
}

/**
 * Granted transaction execution capability.
 *
 * The wallet may reduce the scope (e.g., from '*' to specific patterns).
 */
export interface GrantedTransactionCapability extends TransactionCapability {}

/**
 * Data access capability - for querying private data.
 *
 * Maps to wallet methods:
 * - getAddressBook (when addressBook: true)
 * - getPrivateEvents (when privateEvents specified)
 *
 * @example
 * // Access address book and events from specific contract
 * \{
 *   type: 'data',
 *   addressBook: true,
 *   privateEvents: \{
 *     contracts: [ammAddress],
 *     events: ['Swap', 'LiquidityAdded']
 *   \}
 * \}
 *
 * @example
 * // Access all events from any contract
 * \{
 *   type: 'data',
 *   privateEvents: \{
 *     contracts: '*',
 *     events: '*'
 *   \}
 * \}
 */
export interface DataCapability {
  /** Discriminator for capability type */
  type: 'data';

  /** Access to address book. Maps to: getAddressBook */
  addressBook?: boolean;

  /** Access to private events. Maps to: getPrivateEvents */
  privateEvents?: {
    /**
     * Which contracts to allow event queries from:
     * - '*': Any contract
     * - AztecAddress[]: Specific contracts
     */
    contracts: '*' | AztecAddress[];
  };
}

/**
 * Granted data access capability.
 *
 * The wallet may reduce the scope (e.g., from '*' to specific contracts).
 */
export interface GrantedDataCapability extends DataCapability {}

/**
 * Union type of all capability scopes (app request).
 *
 * Capabilities group wallet operations by their security sensitivity
 * and functional cohesion, making permission requests understandable
 * to users.
 */
export type Capability =
  | AccountsCapability
  | ContractsCapability
  | ContractClassesCapability
  | SimulationCapability
  | TransactionCapability
  | DataCapability;

/**
 * Union type of all granted capabilities (wallet response).
 *
 * The wallet may augment capabilities with additional information:
 * - AccountsCapability: adds specific accounts granted
 * - Other capabilities: may reduce scope (e.g., '*' to specific addresses)
 */
export type GrantedCapability =
  | GrantedAccountsCapability
  | GrantedContractsCapability
  | GrantedContractClassesCapability
  | GrantedSimulationCapability
  | GrantedTransactionCapability
  | GrantedDataCapability;

/**
 * Application capability manifest.
 *
 * Sent by dApp to declare all operations it needs. This reduces authorization
 * friction from multiple dialogs to a single comprehensive permission request.
 *
 * @example
 * // DEX application manifest
 * const manifest: AppCapabilities = \{
 *   version: CAPABILITY_VERSION,
 *   metadata: \{
 *     name: 'MyDEX',
 *     version: '1.0.0',
 *     description: 'Decentralized exchange for private token swaps',
 *     url: 'https://example.com',
 *     icon: 'https://example.com/icon.png'
 *   \},
 *   capabilities: [
 *     \{
 *       type: 'accounts',
 *       canGet: true,
 *       canCreateAuthWit: true
 *     \},
 *     \{
 *       type: 'contracts',
 *       contracts: [ammAddress, tokenAAddress, tokenBAddress],
 *       canRegister: true,
 *       canGetMetadata: true
 *     \},
 *     \{
 *       type: 'simulation',
 *       transactions: \{
 *         scope: [\{ contract: ammAddress, function: '*' \}]
 *       \}
 *     \},
 *     \{
 *       type: 'transaction',
 *       scope: [\{ contract: ammAddress, function: 'swap' \}]
 *     \}
 *   ]
 * \};
 */
export interface AppCapabilities {
  /**
   * Manifest version for forward compatibility.
   * Currently only '1.0' is supported.
   */
  version: typeof CAPABILITY_VERSION;

  /** Application metadata for display in authorization dialogs. */
  metadata: {
    /** Human-readable app name */
    name: string;

    /** App version */
    version: string;

    /** Optional description of what the app does */
    description?: string;

    /** Optional website URL */
    url?: string;

    /** Optional icon URL or data URI */
    icon?: string;
  };

  /**
   * Requested capabilities grouped by scope.
   */
  capabilities: Capability[];
}

/**
 * Wallet capability response.
 *
 * Returned by wallet after user reviews and approves/denies the capability request.
 *
 * The wallet can modify requested capabilities:
 * - Reduce scope (e.g., restrict to specific contracts instead of '*')
 * - Add information (e.g., specify which accounts are granted)
 * - Deny capabilities (by omitting them from the `granted` array)
 *
 * @example
 * // App requests
 * const manifest: AppCapabilities = \{
 *   version: '1.0',
 *   metadata: \{ name: 'MyDApp', version: '1.0.0' \},
 *   capabilities: [
 *     \{ type: 'accounts', canGet: true \},
 *     \{ type: 'contracts', contracts: '*', canRegister: true \}
 *   ]
 * \};
 *
 * // Wallet responds with specific accounts and restricted contracts
 * const response = await wallet.requestCapabilities(manifest);
 * console.log(response.granted);
 * // [
 * //   \{ type: 'accounts', canGet: true, accounts: [addr1, addr2] \},
 * //   \{ type: 'contracts', contracts: [specificContract], canRegister: true \}
 * // ]
 */
export interface WalletCapabilities {
  /** Response version for forward compatibility. */
  version: typeof CAPABILITY_VERSION;

  /**
   * Capabilities granted by the wallet.
   * Capabilities not in this array were implicitly denied.
   * Empty array means the user denied all capabilities.
   */
  granted: GrantedCapability[];

  /** Wallet implementation details. */
  wallet: {
    /** Wallet name/implementation */
    name: string;

    /** Wallet version */
    version: string;
  };
}
