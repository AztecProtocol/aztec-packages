import { AztecAddress } from '@aztec/circuits.js';
import { EventSelector } from '@aztec/foundation/abi';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { Event } from './l1_payload/payload.js';

/**
 * A class which wraps event data which is pushed on L1.
 */
export class L1EventPayload {
  constructor(
    /**
     * A event as emitted from Noir contract. Can be used along with private key to compute nullifier.
     */
    public event: Event,
    /**
     * Address of the contract this tx is interacting with.
     */
    public contractAddress: AztecAddress,
    /**
     * Randomness used to mask the contract address.
     */
    public randomness: Fr,
    /**
     * Type identifier for the underlying event, required to determine how to compute its hash and nullifier.
     */
    public eventTypeId: EventSelector,
  ) {}

  /**
   * Deserializes the L1EventPayload object from a Buffer.
   * @param plaintext - Incoming body plaintext.
   * @returns An instance of L1EventPayload.
   */
  static fromIncomingBodyPlaintextAndContractAddress(
    plaintext: Buffer,
    contractAddress: AztecAddress,
  ): L1EventPayload | undefined {
    try {
      const reader = BufferReader.asReader(plaintext);
      const fields = reader.readArray(plaintext.length / Fr.SIZE_IN_BYTES, Fr);

      const storageSlot = fields[0];
      const eventTypeId = EventSelector.fromField(fields[1]);

      const event = new Event(fields.slice(2));

      return new L1EventPayload(event, contractAddress, storageSlot, eventTypeId);
    } catch (e) {
      return undefined;
    }
  }

  /**
   * Serializes the L1EventPayload object into a Buffer.
   * @returns Buffer representation of the L1EventPayload object.
   */
  toIncomingBodyPlaintext() {
    const fields = [this.randomness, this.eventTypeId.toField(), ...this.event.items];
    return serializeToBuffer(fields);
  }

  /**
   * Create a random L1EventPayload object (useful for testing purposes).
   * @param contract - The address of a contract the event was emitted from.
   * @returns A random L1EventPayload object.
   */
  static random(contract = AztecAddress.random()) {
    return new L1EventPayload(Event.random(), contract, Fr.random(), EventSelector.random());
  }

  public equals(other: L1EventPayload) {
    return (
      this.event.equals(other.event) &&
      this.contractAddress.equals(other.contractAddress) &&
      this.randomness.equals(other.randomness) &&
      this.eventTypeId.equals(other.eventTypeId)
    );
  }
}
