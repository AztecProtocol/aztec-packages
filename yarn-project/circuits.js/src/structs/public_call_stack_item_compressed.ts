import { AztecAddress } from '@aztec/foundation/aztec-address';
import { pedersenHash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { GeneratorIndex } from '../constants.gen.js';
import { CallContext } from './call_context.js';
import { FunctionData } from './function_data.js';

/**
 * Call stack item on a public call.
 */
export class PublicCallStackItemCompressed {
  constructor(
    public contractAddress: AztecAddress,
    public callContext: CallContext,
    public functionData: FunctionData,
    public argsHash: Fr,
  ) {}

  static getFields(fields: FieldsOf<PublicCallStackItemCompressed>) {
    return [fields.contractAddress, fields.callContext, fields.functionData, fields.argsHash] as const;
  }

  toBuffer() {
    return serializeToBuffer(...PublicCallStackItemCompressed.getFields(this));
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PublicCallStackItemCompressed {
    const reader = BufferReader.asReader(buffer);
    return new PublicCallStackItemCompressed(
      reader.readObject(AztecAddress),
      reader.readObject(CallContext),
      reader.readObject(FunctionData),
      reader.readObject(Fr),
    );
  }

  static fromFields(fields: Fr[] | FieldReader): PublicCallStackItemCompressed {
    const reader = FieldReader.asReader(fields);

    const contractAddress = AztecAddress.fromFields(reader);
    const callContext = CallContext.fromFields(reader);
    const functionData = FunctionData.fromFields(reader);
    const argsHash = reader.readField();

    return new PublicCallStackItemCompressed(contractAddress, callContext, functionData, argsHash);
  }

  /**
   * Returns a new instance of PublicCallStackItem with zero contract address, function data and public inputs.
   * @returns A new instance of PublicCallStackItem with zero contract address, function data and public inputs.
   */
  public static empty(): PublicCallStackItemCompressed {
    return new PublicCallStackItemCompressed(
      AztecAddress.ZERO,
      CallContext.empty(),
      FunctionData.empty({ isPrivate: false }),
      Fr.ZERO,
    );
  }

  isEmpty() {
    return (
      this.contractAddress.isZero() &&
      this.callContext.isEmpty() &&
      this.functionData.isEmpty() &&
      this.argsHash.isEmpty()
    );
  }

  /**
   * Computes this call stack item hash.
   * @returns Hash.
   */
  public hash() {
    return pedersenHash(
      [this.contractAddress, this.callContext.hash(), this.functionData.hash(), this.argsHash],
      GeneratorIndex.CALL_STACK_ITEM,
    );
  }
}
