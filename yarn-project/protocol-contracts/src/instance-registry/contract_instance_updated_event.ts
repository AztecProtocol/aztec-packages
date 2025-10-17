import { CONTRACT_INSTANCE_UPDATED_MAGIC_VALUE } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { FieldReader } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceUpdateWithAddress } from '@aztec/stdlib/contract';
import type { PublicLog } from '@aztec/stdlib/logs';
import type { UInt64 } from '@aztec/stdlib/types';

import { ProtocolContractAddress } from '../protocol_contract_data.js';

/**
 * Event emitted when a contract instance is upgraded to a new implementation.
 *
 * @description
 * This event is broadcast when a deployed contract instance changes its implementation
 * by pointing to a different contract class. This enables upgradeable contract patterns
 * while maintaining the same contract address and state.
 *
 * ## Purpose
 *
 * The ContractInstanceUpdatedEvent serves several important functions:
 * - **Upgrade Tracking**: Records when and how contracts are upgraded
 * - **Version History**: Maintains a history of class changes for each instance
 * - **Audit Trail**: Provides transparency for contract upgrades
 * - **Router Updates**: Signals the router to use the new implementation
 * - **Client Synchronization**: Allows clients to update their cached class references
 *
 * ## Event Contents
 *
 * - `address`: The address of the contract instance being upgraded
 * - `prevContractClassId`: The class ID before the upgrade
 * - `newContractClassId`: The class ID after the upgrade
 * - `timestampOfChange`: When the upgrade occurred (block timestamp)
 *
 * ## Usage in Protocol
 *
 * When a contract is upgraded:
 * 1. The contract calls the ContractInstanceRegistry to update its class
 * 2. The registry validates the upgrade is authorized
 * 3. This event is emitted as a public log
 * 4. Network nodes update their instance-to-class mapping
 * 5. Subsequent calls to the contract use the new implementation
 *
 * ## Upgrade Mechanics
 *
 * - The contract address remains unchanged
 * - Storage is preserved across upgrades (assuming compatible layout)
 * - The original class ID is permanently recorded
 * - Multiple upgrades create a version history
 * - Only authorized parties can trigger upgrades
 *
 * ## Public vs Private Logs
 *
 * Note that this event is emitted as a **public log**, making upgrades:
 * - Visible to all network participants
 * - Auditable and transparent
 * - Part of the permanent on-chain record
 * - Essential for security and trust
 *
 * @example
 * ```typescript
 * import { ContractInstanceUpdatedEvent } from '@aztec/protocol-contracts/instance-registry';
 *
 * // Parse upgrade event from logs
 * const event = ContractInstanceUpdatedEvent.fromLog(publicLog);
 * console.log('Contract upgraded:', event.address.toString());
 * console.log('Old implementation:', event.prevContractClassId.toString());
 * console.log('New implementation:', event.newContractClassId.toString());
 * console.log('Upgrade timestamp:', event.timestampOfChange);
 *
 * // Convert to an update object
 * const update = event.toContractInstanceUpdate();
 * console.log('Upgrade record:', update);
 * ```
 */
export class ContractInstanceUpdatedEvent {
  /**
   * Creates a new ContractInstanceUpdatedEvent instance.
   *
   * @param address - The address of the contract instance being upgraded
   * @param prevContractClassId - The contract class ID before the upgrade
   * @param newContractClassId - The contract class ID after the upgrade
   * @param timestampOfChange - The timestamp when the upgrade occurred
   */
  constructor(
    public readonly address: AztecAddress,
    public readonly prevContractClassId: Fr,
    public readonly newContractClassId: Fr,
    public readonly timestampOfChange: UInt64,
  ) {}

  /**
   * Checks if a public log is a ContractInstanceUpdatedEvent.
   *
   * This static method validates that a log came from the ContractInstanceRegistry
   * and has the correct magic value indicating a contract upgrade event.
   *
   * @param log - The public log to check
   * @returns True if the log is a ContractInstanceUpdatedEvent, false otherwise
   *
   * @example
   * ```typescript
   * import { ContractInstanceUpdatedEvent } from '@aztec/protocol-contracts/instance-registry';
   *
   * // Filter upgrade events from public logs
   * const upgradeEvents = publicLogs.filter(log =>
   *   ContractInstanceUpdatedEvent.isContractInstanceUpdatedEvent(log)
   * );
   * ```
   */
  static isContractInstanceUpdatedEvent(log: PublicLog) {
    return (
      log.contractAddress.equals(ProtocolContractAddress.ContractInstanceRegistry) &&
      log.fields[0].toBigInt() === CONTRACT_INSTANCE_UPDATED_MAGIC_VALUE
    );
  }

  /**
   * Parses a ContractInstanceUpdatedEvent from a public log.
   *
   * This method deserializes the log data into a structured event object,
   * extracting the contract address, previous and new class IDs, and upgrade timestamp.
   *
   * @param log - The public log containing the event data
   * @returns A new ContractInstanceUpdatedEvent instance
   *
   * @example
   * ```typescript
   * import { ContractInstanceUpdatedEvent } from '@aztec/protocol-contracts/instance-registry';
   *
   * // Parse upgrade event from a public log
   * const event = ContractInstanceUpdatedEvent.fromLog(publicLog);
   * console.log('Upgraded from:', event.prevContractClassId.toString());
   * console.log('Upgraded to:', event.newContractClassId.toString());
   * console.log('At time:', event.timestampOfChange);
   * ```
   */
  static fromLog(log: PublicLog) {
    const reader = new FieldReader(log.fields.slice(1) /* remove tag */);
    const address = reader.readObject(AztecAddress);
    const prevContractClassId = reader.readField();
    const newContractClassId = reader.readField();
    const timestampOfChange = reader.readField().toBigInt();
    return new ContractInstanceUpdatedEvent(address, prevContractClassId, newContractClassId, timestampOfChange);
  }

  /**
   * Converts this event to a ContractInstanceUpdateWithAddress object.
   *
   * This method constructs a structured update record that can be used to
   * track contract upgrade history or update local state.
   *
   * @returns The ContractInstanceUpdateWithAddress object
   *
   * @example
   * ```typescript
   * import { ContractInstanceUpdatedEvent } from '@aztec/protocol-contracts/instance-registry';
   *
   * // Parse and convert event to update record
   * const event = ContractInstanceUpdatedEvent.fromLog(publicLog);
   * const update = event.toContractInstanceUpdate();
   *
   * // Store the upgrade record
   * await upgradeHistory.addRecord(update);
   * console.log(`Contract ${update.address} upgraded at ${update.timestampOfChange}`);
   * ```
   */
  toContractInstanceUpdate(): ContractInstanceUpdateWithAddress {
    return {
      address: this.address,
      prevContractClassId: this.prevContractClassId,
      newContractClassId: this.newContractClassId,
      timestampOfChange: this.timestampOfChange,
    };
  }
}
