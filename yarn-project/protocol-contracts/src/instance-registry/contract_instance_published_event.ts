import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';
import type { PrivateLog } from '@aztec/stdlib/logs';

import { CONTRACT_INSTANCE_PUBLISHED_EVENT_TAG } from '../protocol_contract_data.js';

/**
 * Event emitted when a new contract instance is deployed via the ContractInstanceRegistry.
 *
 * @description
 * This event is broadcast when a contract instance is deployed on the Aztec network.
 * It contains all the information needed to interact with the deployed contract,
 * including its address, the class it implements, initialization parameters, and
 * cryptographic keys for privacy operations.
 *
 * ## Purpose
 *
 * The ContractInstancePublishedEvent serves several critical functions:
 * - **Instance Discovery**: Allows nodes and users to discover new contract deployments
 * - **Address Resolution**: Maps contract addresses to their implementation classes
 * - **Key Distribution**: Publishes the public keys needed for private interactions
 * - **Deployment Tracking**: Records who deployed the contract and when
 * - **Initialization**: Captures the initialization state of the contract
 *
 * ## Event Contents
 *
 * - `address`: The unique address where the contract is deployed
 * - `version`: Contract instance format version (currently always 1)
 * - `salt`: Random salt used in address derivation for uniqueness
 * - `contractClassId`: Reference to the contract class this instance implements
 * - `initializationHash`: Hash of the constructor arguments and state
 * - `publicKeys`: Encryption and nullifier keys for private operations
 * - `deployer`: Address of the account that deployed this instance
 *
 * ## Usage in Protocol
 *
 * When a contract is deployed:
 * 1. The deployer calls the ContractInstanceRegistry
 * 2. The registry computes and validates the contract address
 * 3. This event is emitted as a private log
 * 4. Network nodes receive and index the deployment
 * 5. Users can now interact with the contract at its address
 *
 * ## Private vs Public Logs
 *
 * Note that this event is emitted as a **private log**, meaning:
 * - The deployment information is encrypted
 * - Only parties with appropriate viewing keys can see the details
 * - This provides privacy for contract deployments when needed
 * - However, the contract address itself becomes publicly known once used
 *
 * @example
 * ```typescript
 * import { ContractInstancePublishedEvent } from '@aztec/protocol-contracts/instance-registry';
 *
 * // Parse deployment event from logs
 * const event = ContractInstancePublishedEvent.fromLog(privateLog);
 * console.log('Contract deployed at:', event.address.toString());
 * console.log('Implements class:', event.contractClassId.toString());
 * console.log('Deployed by:', event.deployer.toString());
 * console.log('Initialization hash:', event.initializationHash.toString());
 *
 * // Convert to a contract instance object
 * const instance = event.toContractInstance();
 * console.log('Instance address:', instance.address.toString());
 * console.log('Public keys:', instance.publicKeys);
 * ```
 */
export class ContractInstancePublishedEvent {
  /**
   * Creates a new ContractInstancePublishedEvent instance.
   *
   * @param address - The address where the contract instance is deployed
   * @param version - The version of the contract instance format
   * @param salt - Random salt used in address derivation
   * @param contractClassId - ID of the contract class this instance implements
   * @param initializationHash - Hash of the constructor arguments and initial state
   * @param publicKeys - Encryption and nullifier public keys for the contract
   * @param deployer - Address of the account that deployed this instance
   */
  constructor(
    public readonly address: AztecAddress,
    public readonly version: number,
    public readonly salt: Fr,
    public readonly contractClassId: Fr,
    public readonly initializationHash: Fr,
    public readonly publicKeys: PublicKeys,
    public readonly deployer: AztecAddress,
  ) {}

  /**
   * Checks if a private log is a ContractInstancePublishedEvent.
   *
   * This static method validates that a log has the correct event tag indicating
   * a contract instance publication from the ContractInstanceRegistry.
   *
   * @param log - The private log to check
   * @returns True if the log is a ContractInstancePublishedEvent, false otherwise
   *
   * @example
   * ```typescript
   * import { ContractInstancePublishedEvent } from '@aztec/protocol-contracts/instance-registry';
   *
   * // Filter deployment events from private logs
   * const deploymentEvents = privateLogs.filter(log =>
   *   ContractInstancePublishedEvent.isContractInstancePublishedEvent(log)
   * );
   * ```
   */
  static isContractInstancePublishedEvent(log: PrivateLog) {
    return log.fields[0].equals(CONTRACT_INSTANCE_PUBLISHED_EVENT_TAG);
  }

  /**
   * Parses a ContractInstancePublishedEvent from a private log.
   *
   * This method deserializes the log data into a structured event object,
   * extracting the deployment address, class reference, keys, and other metadata.
   *
   * @param log - The private log containing the event data
   * @returns A new ContractInstancePublishedEvent instance
   *
   * @example
   * ```typescript
   * import { ContractInstancePublishedEvent } from '@aztec/protocol-contracts/instance-registry';
   *
   * // Parse deployment event from a private log
   * const event = ContractInstancePublishedEvent.fromLog(privateLog);
   * console.log('New contract at:', event.address.toString());
   * console.log('Salt used:', event.salt.toString());
   * console.log('Deployed by:', event.deployer.toString());
   * ```
   */
  static fromLog(log: PrivateLog) {
    const bufferWithoutTag = log.toBuffer().subarray(32);
    const reader = new BufferReader(bufferWithoutTag);
    const address = reader.readObject(AztecAddress);
    const version = reader.readObject(Fr).toNumber();
    const salt = reader.readObject(Fr);
    const contractClassId = reader.readObject(Fr);
    const initializationHash = reader.readObject(Fr);
    const publicKeys = reader.readObject(PublicKeys);
    const deployer = reader.readObject(AztecAddress);

    return new ContractInstancePublishedEvent(
      address,
      version,
      salt,
      contractClassId,
      initializationHash,
      publicKeys,
      deployer,
    );
  }

  /**
   * Converts this event to a ContractInstanceWithAddress object.
   *
   * This method constructs a complete contract instance object that can be used
   * to interact with the deployed contract. The instance includes all necessary
   * information for making calls and managing the contract lifecycle.
   *
   * @returns The ContractInstanceWithAddress object
   * @throws Error if the version is not supported (currently only version 1)
   *
   * @remarks
   * The returned instance has both `currentContractClassId` and `originalContractClassId`
   * set to the same value initially. These may diverge if the contract is later upgraded.
   *
   * @example
   * ```typescript
   * import { ContractInstancePublishedEvent } from '@aztec/protocol-contracts/instance-registry';
   *
   * // Parse and convert event to instance
   * const event = ContractInstancePublishedEvent.fromLog(privateLog);
   * const instance = event.toContractInstance();
   *
   * // Use the instance for contract interactions
   * console.log('Contract at:', instance.address.toString());
   * console.log('Current class:', instance.currentContractClassId.toString());
   * console.log('Original class:', instance.originalContractClassId.toString());
   * console.log('Encryption key:', instance.publicKeys.masterIncomingViewingPublicKey);
   * ```
   */
  toContractInstance(): ContractInstanceWithAddress {
    if (this.version !== 1) {
      throw new Error(`Unexpected contract instance version ${this.version}`);
    }

    return {
      address: this.address,
      version: this.version,
      currentContractClassId: this.contractClassId,
      originalContractClassId: this.contractClassId,
      initializationHash: this.initializationHash,
      publicKeys: this.publicKeys,
      salt: this.salt,
      deployer: this.deployer,
    };
  }
}
