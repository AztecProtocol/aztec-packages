import { AztecAddress, type PrivateLog } from '@aztec/circuits.js';
import { EventSelector } from '@aztec/foundation/abi';
import { type Fq, Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { EncryptedLogPayload } from './encrypted_log_payload.js';
import { Event } from './payload.js';

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
     * Type identifier for the underlying event, required to determine how to compute its hash and nullifier.
     */
    public eventTypeId: EventSelector,
  ) {}

  static #fromIncomingBodyPlaintextAndContractAddress(
    plaintext: Buffer,
    contractAddress: AztecAddress,
  ): L1EventPayload | undefined {
    let payload: L1EventPayload;
    try {
      const reader = BufferReader.asReader(plaintext);
      const fields = reader.readArray(plaintext.length / Fr.SIZE_IN_BYTES, Fr);

      const eventTypeId = EventSelector.fromField(fields[0]);

      const event = new Event(fields.slice(1));

      payload = new L1EventPayload(event, contractAddress, eventTypeId);
    } catch (e) {
      return undefined;
    }

    return payload;
  }

  static async decryptAsIncoming(log: PrivateLog, sk: Fq): Promise<L1EventPayload | undefined> {
    const decryptedLog = await EncryptedLogPayload.decryptAsIncoming(log.fields, sk);
    if (!decryptedLog) {
      return undefined;
    }

    return this.#fromIncomingBodyPlaintextAndContractAddress(
      decryptedLog.incomingBodyPlaintext,
      decryptedLog.contractAddress,
    );
  }

  /**
   * Serializes the L1EventPayload object into a Buffer.
   * @returns Buffer representation of the L1EventPayload object.
   */
  toIncomingBodyPlaintext() {
    const fields = [this.eventTypeId.toField(), ...this.event.items];
    return serializeToBuffer(fields);
  }

  /**
   * Create a random L1EventPayload object (useful for testing purposes).
   * @param contract - The address of a contract the event was emitted from.
   * @returns A random L1EventPayload object.
   */
  static async random(contract?: AztecAddress) {
    return new L1EventPayload(Event.random(), contract ?? (await AztecAddress.random()), EventSelector.random());
  }

  public equals(other: L1EventPayload) {
    return (
      this.event.equals(other.event) &&
      this.contractAddress.equals(other.contractAddress) &&
      this.eventTypeId.equals(other.eventTypeId)
    );
  }
}
