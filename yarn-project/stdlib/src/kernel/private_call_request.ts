import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';

import { CallContext } from '../tx/call_context.js';

export class PrivateCallRequest {
  constructor(
    /**
     * The call context of the call.
     */
    public callContext: CallContext,
    /**
     * The hash of the arguments of the call.
     */
    public argsHash: Fr,
    /**
     * The hash of the return values of the call.
     */
    public returnsHash: Fr,
    /**
     * The start counter of the call.
     */
    public startSideEffectCounter: number,
    /**
     * The end counter of the call.
     */
    public endSideEffectCounter: number,
  ) {}

  toFields(): Fr[] {
    return serializeToFields([
      this.callContext,
      this.argsHash,
      this.returnsHash,
      this.startSideEffectCounter,
      this.endSideEffectCounter,
    ]);
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new PrivateCallRequest(
      reader.readObject(CallContext),
      reader.readField(),
      reader.readField(),
      reader.readU32(),
      reader.readU32(),
    );
  }

  toBuffer() {
    return serializeToBuffer(
      this.callContext,
      this.argsHash,
      this.returnsHash,
      this.startSideEffectCounter,
      this.endSideEffectCounter,
    );
  }

  public static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PrivateCallRequest(
      reader.readObject(CallContext),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      reader.readNumber(),
      reader.readNumber(),
    );
  }

  isEmpty() {
    return (
      this.callContext.isEmpty() &&
      this.argsHash.isZero() &&
      this.returnsHash.isZero() &&
      this.startSideEffectCounter === 0 &&
      this.endSideEffectCounter === 0
    );
  }

  public static empty() {
    return new PrivateCallRequest(CallContext.empty(), Fr.ZERO, Fr.ZERO, 0, 0);
  }

  equals(callRequest: PrivateCallRequest) {
    return (
      callRequest.callContext.equals(this.callContext) &&
      callRequest.argsHash.equals(this.argsHash) &&
      callRequest.returnsHash.equals(this.returnsHash) &&
      callRequest.startSideEffectCounter === this.startSideEffectCounter &&
      callRequest.endSideEffectCounter === this.endSideEffectCounter
    );
  }

  toString() {
    return `PrivateCallRequest(contractAddress: ${this.callContext.contractAddress}, selector: ${this.callContext.functionSelector}, msgSender: ${this.callContext.msgSender}, isStatic: ${this.callContext.isEmpty},  argsHash: ${this.argsHash}, returnsHash: ${this.returnsHash}, startSideEffectCounter: ${this.startSideEffectCounter}, endSideEffectCounter: ${this.endSideEffectCounter})`;
  }
}
