import { CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { FieldReader } from '@aztec/foundation/serialize';
import { bufferFromFields } from '@aztec/stdlib/abi';
import {
  type ContractClassPublic,
  computeContractClassId,
  computePublicBytecodeCommitment,
} from '@aztec/stdlib/contract';
import type { ContractClassLog } from '@aztec/stdlib/logs';

import { ProtocolContractAddress } from '../protocol_contract_data.js';

/**
 * Event emitted when a new contract class is registered in the ContractClassRegistry.
 *
 * @description
 * This event is broadcast when a contract class (the code template for contracts) is
 * registered on-chain. It contains all the information needed to reconstruct the contract
 * class, including its ID, version, artifact hash, private functions root, and public bytecode.
 *
 * ## Purpose
 *
 * The ContractClassPublishedEvent serves several critical purposes:
 * - **Class Discovery**: Allows nodes to discover new contract classes
 * - **Bytecode Distribution**: Broadcasts the contract's executable code
 * - **Verification**: Enables independent verification of class ID computation
 * - **Synchronization**: Helps nodes sync contract class state
 *
 * ## Event Contents
 *
 * - `contractClassId`: Unique identifier computed from the class's cryptographic commitments
 * - `version`: Contract class version (currently always 1)
 * - `artifactHash`: Hash of the contract artifact metadata
 * - `privateFunctionsRoot`: Root of the merkle tree of private functions
 * - `packedPublicBytecode`: Compressed public function bytecode
 *
 * ## Usage in Protocol
 *
 * When a new contract is deployed:
 * 1. If the class doesn't exist, it's registered in the ContractClassRegistry
 * 2. This event is emitted with the class details
 * 3. Network nodes receive and process the event
 * 4. Nodes store the class for future contract deployments
 * 5. Multiple instances can later reference this single class
 *
 * @example
 * ```typescript
 * import { ContractClassPublishedEvent } from '@aztec/protocol-contracts/class-registry';
 *
 * // Parse event from logs
 * const event = ContractClassPublishedEvent.fromLog(contractClassLog);
 * console.log('New class registered:', event.contractClassId.toString());
 * console.log('Artifact hash:', event.artifactHash.toString());
 * console.log('Version:', event.version);
 *
 * // Convert to a contract class object
 * const contractClass = await event.toContractClassPublic();
 * console.log('Contract class ID:', contractClass.id.toString());
 * console.log('Has private functions:', contractClass.privateFunctions.length);
 * ```
 */
export class ContractClassPublishedEvent {
  /**
   * Creates a new ContractClassPublishedEvent instance.
   *
   * @param contractClassId - The unique identifier for this contract class
   * @param version - The version of the contract class format
   * @param artifactHash - Hash of the contract's artifact metadata
   * @param privateFunctionsRoot - Merkle root of the private functions tree
   * @param packedPublicBytecode - Compressed bytecode for public functions
   */
  constructor(
    public readonly contractClassId: Fr,
    public readonly version: number,
    public readonly artifactHash: Fr,
    public readonly privateFunctionsRoot: Fr,
    public readonly packedPublicBytecode: Buffer,
  ) {}

  /**
   * Checks if a log is a ContractClassPublishedEvent.
   *
   * This static method validates that a log came from the ContractClassRegistry
   * and has the correct magic value tag indicating a class publication event.
   *
   * @param log - The contract class log to check
   * @returns True if the log is a ContractClassPublishedEvent, false otherwise
   *
   * @example
   * ```typescript
   * import { ContractClassPublishedEvent } from '@aztec/protocol-contracts/class-registry';
   *
   * // Filter class publication events from logs
   * const publishedEvents = logs.filter(log =>
   *   ContractClassPublishedEvent.isContractClassPublishedEvent(log)
   * );
   * ```
   */
  static isContractClassPublishedEvent(log: ContractClassLog) {
    return (
      log.contractAddress.equals(ProtocolContractAddress.ContractClassRegistry) &&
      log.fields.fields[0].toBigInt() === CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE
    );
  }

  /**
   * Parses a ContractClassPublishedEvent from a contract class log.
   *
   * This method deserializes the log data into a structured event object,
   * extracting the contract class ID, version, hashes, and bytecode.
   *
   * @param log - The contract class log containing the event data
   * @returns A new ContractClassPublishedEvent instance
   *
   * @example
   * ```typescript
   * import { ContractClassPublishedEvent } from '@aztec/protocol-contracts/class-registry';
   *
   * // Parse event from a log
   * const event = ContractClassPublishedEvent.fromLog(log);
   * console.log('Class registered:', event.contractClassId.toString());
   * console.log('Public bytecode size:', event.packedPublicBytecode.length);
   * ```
   */
  static fromLog(log: ContractClassLog) {
    const fieldsWithoutTag = log.fields.fields.slice(1);
    const reader = new FieldReader(fieldsWithoutTag);
    const contractClassId = reader.readField();
    const version = reader.readField().toNumber();
    const artifactHash = reader.readField();
    const privateFunctionsRoot = reader.readField();
    const packedPublicBytecode = bufferFromFields(reader.readFieldArray(fieldsWithoutTag.length - reader.cursor));

    return new ContractClassPublishedEvent(
      contractClassId,
      version,
      artifactHash,
      privateFunctionsRoot,
      packedPublicBytecode,
    );
  }

  /**
   * Converts this event to a ContractClassPublic object.
   *
   * This method validates the contract class ID by recomputing it from the event data
   * and constructing a complete ContractClassPublic object. This object can be used
   * to store the class or deploy instances of it.
   *
   * @returns A Promise resolving to the ContractClassPublic object
   * @throws Error if the contract class ID doesn't match the computed value
   * @throws Error if the version is not supported (currently only version 1)
   *
   * @remarks
   * The method performs cryptographic verification:
   * 1. Computes the public bytecode commitment
   * 2. Derives the class ID from artifact hash, private functions root, and bytecode commitment
   * 3. Validates that the computed ID matches the event's class ID
   * 4. Ensures the version is supported
   *
   * @example
   * ```typescript
   * import { ContractClassPublishedEvent } from '@aztec/protocol-contracts/class-registry';
   *
   * // Parse and convert event to contract class
   * const event = ContractClassPublishedEvent.fromLog(log);
   * const contractClass = await event.toContractClassPublic();
   *
   * // Use the contract class
   * console.log('Verified class ID:', contractClass.id.toString());
   * console.log('Artifact hash:', contractClass.artifactHash.toString());
   * console.log('Private functions root:', contractClass.privateFunctionsRoot.toString());
   * ```
   */
  async toContractClassPublic(): Promise<ContractClassPublic> {
    const computedClassId = await computeContractClassId({
      artifactHash: this.artifactHash,
      privateFunctionsRoot: this.privateFunctionsRoot,
      publicBytecodeCommitment: await computePublicBytecodeCommitment(this.packedPublicBytecode),
    });

    if (!computedClassId.equals(this.contractClassId)) {
      throw new Error(
        `Invalid contract class id: computed ${computedClassId.toString()} but event broadcasted ${this.contractClassId.toString()}`,
      );
    }

    if (this.version !== 1) {
      throw new Error(`Unexpected contract class version ${this.version}`);
    }

    return {
      id: this.contractClassId,
      artifactHash: this.artifactHash,
      packedBytecode: this.packedPublicBytecode,
      privateFunctionsRoot: this.privateFunctionsRoot,
      version: this.version,
      privateFunctions: [],
      utilityFunctions: [],
    };
  }
}
