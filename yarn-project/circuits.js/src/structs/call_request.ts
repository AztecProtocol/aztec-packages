import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { CallerContext } from './caller_context.js';

/**
 * Call request.
 */
export class CallRequest {
  constructor(
    /**
     * The hash of the call stack item.
     */
    public hash: Fr,
    /**
     * The address of the contract calling the function.
     */
    public callerContractAddress: AztecAddress,
    /**
     * The call context of the contract calling the function.
     */
    public callerContext: CallerContext,
    /**
     * The call context of the contract calling the function.
     */
    public startSideEffectCounter: Fr,
    /**
     * The call context of the contract calling the function.
     */
    public endSideEffectCounter: Fr,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.hash,
      this.callerContractAddress,
      this.callerContext,
      this.startSideEffectCounter,
      this.endSideEffectCounter,
    );
  }

  get counter() {
    return this.startSideEffectCounter.toNumber();
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance of CallRequest.
   */
  public static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new CallRequest(
      Fr.fromBuffer(reader),
      reader.readObject(AztecAddress),
      reader.readObject(CallerContext),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
    );
  }

  public static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new CallRequest(
      reader.readField(),
      reader.readObject(AztecAddress),
      reader.readObject(CallerContext),
      reader.readField(),
      reader.readField(),
    );
  }

  isEmpty() {
    return (
      this.hash.isZero() &&
      this.callerContractAddress.isZero() &&
      this.callerContext.isEmpty() &&
      this.startSideEffectCounter.isZero() &&
      this.endSideEffectCounter.isZero()
    );
  }

  /**
   * Returns a new instance of CallRequest with zero hash, caller contract address and caller context.
   * @returns A new instance of CallRequest with zero hash, caller contract address and caller context.
   */
  public static empty() {
    return new CallRequest(Fr.ZERO, AztecAddress.ZERO, CallerContext.empty(), Fr.ZERO, Fr.ZERO);
  }

  equals(callRequest: CallRequest) {
    return (
      callRequest.hash.equals(this.hash) &&
      callRequest.callerContractAddress.equals(this.callerContractAddress) &&
      callRequest.callerContext.equals(this.callerContext) &&
      callRequest.startSideEffectCounter.equals(this.startSideEffectCounter) &&
      callRequest.endSideEffectCounter.equals(this.endSideEffectCounter)
    );
  }

  toString() {
    return `CallRequest(hash: ${this.hash.toString()}, callerContractAddress: ${this.callerContractAddress.toString()}, callerContext: ${this.callerContext.toString()}, startSideEffectCounter: ${this.startSideEffectCounter.toString()}, endSideEffectCounter: ${this.endSideEffectCounter.toString()})`;
  }
}
