import { AztecAddress, Fr } from '@aztec/foundation';
import { encode } from '@msgpack/msgpack';

/**
 * Arguments for computing a leaf index of a storage slot.
 * Note: Doesn't contain deserialization methods because its use is uni-directional (from TS to Wasm).
 */
export class ComputeLeafIndexArgs {
  constructor(
    /**
     * Address of the contract who owns the storage.
     */
    public contract: AztecAddress,
    /**
     * Slot within the contract storage.
     */
    public slot: Fr,
  ) {}

  /**
   * Serializes the contract and slot to a msgpack buffer.
   * @returns Msgpack encoded buffer of the contract and slot.
   */
  public toMsgpackBuffer(): Buffer {
    const buf = encode([this.contract, this.slot]);
    return Buffer.from(buf);
  }
}
