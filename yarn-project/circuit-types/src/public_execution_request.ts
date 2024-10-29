import { CallContext, type PublicCallRequest, Vector } from '@aztec/circuits.js';
import { computeVarArgsHash } from '@aztec/circuits.js/hash';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';

/**
 * The execution request of a public function.
 */
export class PublicExecutionRequest {
  constructor(
    /**
     * Context of the public call.
     */
    public callContext: CallContext,
    /**
     * Function arguments.
     */
    public args: Fr[],
  ) {}

  getSize() {
    return this.isEmpty() ? 0 : this.toBuffer().length;
  }

  toBuffer() {
    return serializeToBuffer(this.callContext, new Vector(this.args));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicExecutionRequest(CallContext.fromBuffer(reader), reader.readVector(Fr));
  }

  static from(fields: FieldsOf<PublicExecutionRequest>): PublicExecutionRequest {
    return new PublicExecutionRequest(...PublicExecutionRequest.getFields(fields));
  }

  static getFields(fields: FieldsOf<PublicExecutionRequest>) {
    return [fields.callContext, fields.args] as const;
  }

  static empty() {
    return new PublicExecutionRequest(CallContext.empty(), []);
  }

  isEmpty(): boolean {
    return this.callContext.isEmpty() && this.args.length === 0;
  }

  isForCallRequest(callRequest: PublicCallRequest) {
    return (
      this.callContext.equals(callRequest.callContext) && computeVarArgsHash(this.args).equals(callRequest.argsHash)
    );
  }

  [inspect.custom]() {
    return `PublicExecutionRequest {
      callContext: ${this.callContext}
      args: ${this.args}
    }`;
  }
}
