import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

import { FunctionSelector } from '../abi/function_selector.js';
import { PublicCallRequest } from '../kernel/public_call_request.js';
import { type ZodFor, schemas } from '../schemas/index.js';
import { Vector } from '../types/index.js';

/**
 * The call request of a public function, including the calldata.
 */
export class PublicCallRequestWithCalldata {
  constructor(
    /**
     * Request of the public call.
     */
    public request: PublicCallRequest,
    /**
     * Function selector and arguments of the public call.
     */
    public calldata: Fr[],
  ) {}

  // Public functions get routed through the dispatch function, whose first argument is the target function selector.
  get functionSelector(): FunctionSelector {
    return FunctionSelector.fromField(this.calldata[0]);
  }

  get args(): Fr[] {
    return this.calldata.slice(1);
  }

  static get schema(): ZodFor<PublicCallRequestWithCalldata> {
    return z
      .object({
        request: PublicCallRequest.schema,
        calldata: z.array(schemas.Fr),
      })
      .transform(PublicCallRequestWithCalldata.from);
  }

  static from(fields: Pick<PublicCallRequestWithCalldata, 'request' | 'calldata'>): PublicCallRequestWithCalldata {
    return new PublicCallRequestWithCalldata(fields.request, fields.calldata);
  }

  /**
   * Creates a PublicCallRequestWithCalldata from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing PublicCallRequestWithCalldata fields
   * @returns A PublicCallRequestWithCalldata instance
   */
  static fromPlainObject(obj: any): PublicCallRequestWithCalldata {
    if (obj instanceof PublicCallRequestWithCalldata) {
      return obj;
    }
    return new PublicCallRequestWithCalldata(
      PublicCallRequest.fromPlainObject(obj.request),
      obj.calldata.map((f: any) => Fr.fromPlainObject(f)),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.request, new Vector(this.calldata));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicCallRequestWithCalldata(PublicCallRequest.fromBuffer(reader), reader.readVector(Fr));
  }

  static empty() {
    return new PublicCallRequestWithCalldata(PublicCallRequest.empty(), []);
  }

  isEmpty(): boolean {
    return this.request.isEmpty() && this.calldata.length === 0;
  }

  [inspect.custom]() {
    return `PublicCallRequestWithCalldata {
      request: ${inspect(this.request)}
      calldata: ${this.calldata}
    }`;
  }
}
