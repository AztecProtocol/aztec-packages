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
import { ExecutionRequest } from './execution_request.js';

// TODO: REVIEW THIS FILE

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
    public args: Fr[],
    /**
     * Transaction context.
     */
    public txContext: TxContext,
  ) {}

  // TODO(#663): The only reason why we need to manually create a tx request from a tx execution request
  // is because of direct public function invocations. For private runs, the args hash should be calculated by
  // the private execution simulator, and used to populate the tx request, instead of being manually calculated.
  // This should be removed once we kill direct public function calls when we go full AA.
  async toTxRequest(): Promise<TxRequest> {
    return this.toTxRequestUsingArgsHash(await computeVarArgsHash(await CircuitsWasm.get(), this.args));
  }

  toTxRequestUsingArgsHash(argsHash: Fr): TxRequest {
    return new TxRequest(this.origin, this.functionData, argsHash, this.txContext);
  }

  static getFields(fields: FieldsOf<TxExecutionRequest>) {
    return [fields.origin, fields.functionData, fields.args, fields.txContext] as const;
  }

  static from(fields: FieldsOf<TxExecutionRequest>): TxExecutionRequest {
    return new TxExecutionRequest(...TxExecutionRequest.getFields(fields));
  }

  static fromExecutionRequest(fields: AccountExecutionRequest): TxExecutionRequest {
    return TxExecutionRequest.from({
      ...fields,
      origin: fields.origin,
      txContext: TxContext.empty(),
    });
  }

  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.origin, this.functionData, new Vector(this.args), this.txContext);
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
      reader.readVector(Fr),
      reader.readObject(TxContext),
    );
  }
}

/** An execution request for an account contract entrypoint */
type AccountExecutionRequest = Pick<FieldsOf<ExecutionRequest>, 'args' | 'functionData'> & {
  /** The account contract to execute this entrypoint request */
  origin: AztecAddress;
};
