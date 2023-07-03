import {
  AztecAddress,
  CircuitsWasm,
  FieldsOf,
  Fr,
  FunctionData,
  TxContext,
  TxRequest,
  Vector,
} from '@aztec/circuits.js';
import { computeVarArgsHash } from '@aztec/circuits.js/abis';
import { BufferReader, serializeToBuffer } from '@aztec/circuits.js/utils';

/**
 * Packs a set of arguments into a hash.
 */
export class PackedArguments {
  constructor(
    /**
     *  Function arguments.
     */
    public args: Fr[],
    /**
     * The hash of the args
     */
    public hash: Fr,
  ) {}

  static getFields(fields: FieldsOf<PackedArguments>) {
    return [fields.args, fields.hash] as const;
  }

  static from(fields: FieldsOf<PackedArguments>): PackedArguments {
    return new PackedArguments(...PackedArguments.getFields(fields));
  }

  static async fromArgs(args: Fr[], wasm: CircuitsWasm) {
    return new PackedArguments(args, await computeVarArgsHash(wasm, args));
  }

  toBuffer() {
    return serializeToBuffer(new Vector(this.args), this.hash);
  }

  static fromBuffer(buffer: Buffer | BufferReader): PackedArguments {
    const reader = BufferReader.asReader(buffer);
    return new PackedArguments(reader.readVector(Fr), reader.readFr());
  }
}

/**
 * Request to execute a transaction. Similar to TxRequest, but has the full args.
 */
export class TxExecutionRequest {
  constructor(
    /**
     * Sender.
     */
    public origin: AztecAddress,
    /**
     * Function data representing the function to call.
     */
    public functionData: FunctionData,
    /**
     * Function arguments.
     */
    public argsHash: Fr,
    /**
     * Transaction context.
     */
    public txContext: TxContext,
    /**
     * Packed arguments
     */
    public packedArguments: PackedArguments[],
  ) {}

  toTxRequest(): TxRequest {
    return new TxRequest(this.origin, this.functionData, this.argsHash, this.txContext);
  }

  static getFields(fields: FieldsOf<TxExecutionRequest>) {
    return [fields.origin, fields.functionData, fields.argsHash, fields.txContext, fields.packedArguments] as const;
  }

  static from(fields: FieldsOf<TxExecutionRequest>): TxExecutionRequest {
    return new TxExecutionRequest(...TxExecutionRequest.getFields(fields));
  }

  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(
      this.origin,
      this.functionData,
      this.argsHash,
      this.txContext,
      new Vector(this.packedArguments),
    );
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   * @returns The deserialised TxRequest object.
   */
  static fromBuffer(buffer: Buffer | BufferReader): TxExecutionRequest {
    const reader = BufferReader.asReader(buffer);
    return new TxExecutionRequest(
      reader.readObject(AztecAddress),
      reader.readObject(FunctionData),
      reader.readFr(),
      reader.readObject(TxContext),
      reader.readVector(PackedArguments),
    );
  }
}
