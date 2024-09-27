import { AztecAddress } from '@aztec/circuits.js';
import { EventSelector } from '@aztec/foundation/abi';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { type Fq, Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { type EncryptedL2Log } from '../encrypted_l2_log.js';
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
     * Randomness used to mask the contract address.
     */
    public randomness: Fr,
    /**
     * Type identifier for the underlying event, required to determine how to compute its hash and nullifier.
     */
    public eventTypeId: EventSelector,
  ) {}

  static #fromIncomingBodyPlaintextAndContractAddress(
    plaintext: Buffer,
    contractAddress: AztecAddress,
    maskedContractAddress: Fr,
  ): L1EventPayload | undefined {
    let payload: L1EventPayload;
    try {
      const reader = BufferReader.asReader(plaintext);
      const fields = reader.readArray(plaintext.length / Fr.SIZE_IN_BYTES, Fr);

      const randomness = fields[0];
      const eventTypeId = EventSelector.fromField(fields[1]);

      const event = new Event(fields.slice(2));

      payload = new L1EventPayload(event, contractAddress, randomness, eventTypeId);
    } catch (e) {
      return undefined;
    }

    ensureMatchedMaskedContractAddress(contractAddress, payload.randomness, maskedContractAddress);

    return payload;
  }

  static decryptAsIncoming(log: EncryptedL2Log, sk: Fq): L1EventPayload | undefined {
    const decryptedLog = EncryptedLogPayload.decryptAsIncoming(log.data, sk);
    if (!decryptedLog) {
      return undefined;
    }

    return this.#fromIncomingBodyPlaintextAndContractAddress(
      decryptedLog.incomingBodyPlaintext,
      decryptedLog.contractAddress,
      log.maskedContractAddress,
    );
  }

  static decryptAsOutgoing(log: EncryptedL2Log, sk: Fq): L1EventPayload | undefined {
    const decryptedLog = EncryptedLogPayload.decryptAsOutgoing(log.data, sk);
    if (!decryptedLog) {
      return undefined;
    }

    return this.#fromIncomingBodyPlaintextAndContractAddress(
      decryptedLog.incomingBodyPlaintext,
      decryptedLog.contractAddress,
      log.maskedContractAddress,
    );
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

function ensureMatchedMaskedContractAddress(contractAddress: AztecAddress, randomness: Fr, maskedContractAddress: Fr) {
  if (!poseidon2HashWithSeparator([contractAddress, randomness], 0).equals(maskedContractAddress)) {
    throw new Error(
      'The provided masked contract address does not match with the incoming address from header and randomness from body',
    );
  }
}
