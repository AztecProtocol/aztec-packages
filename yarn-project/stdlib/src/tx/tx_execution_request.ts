import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import type { FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';
import { z } from 'zod';

import { FunctionSelector } from '../abi/function_selector.js';
import { AuthWitness } from '../auth_witness/auth_witness.js';
import { AztecAddress } from '../aztec-address/index.js';
import { type ZodFor, schemas } from '../schemas/index.js';
import { Vector } from '../types/shared.js';
import { Capsule } from './capsule.js';
import { FunctionData } from './function_data.js';
import { HashedValues } from './hashed_values.js';
import { TxContext } from './tx_context.js';
import { TxRequest } from './tx_request.js';

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
     * Selector of the function to call.
     */
    public functionSelector: FunctionSelector,
    /**
     * The hash of arguments of first call to be executed (usually account entrypoint).
     * @dev This hash is a pointer to `argsOfCalls` unordered array.
     */
    public firstCallArgsHash: Fr,
    /**
     * Transaction context.
     */
    public txContext: TxContext,
    /**
     * An unordered array of packed arguments for each call in the transaction.
     * @dev These arguments are accessed in Noir via oracle and constrained against the args hash. The length of
     * the array is equal to the number of function calls in the transaction (1 args per 1 call).
     */
    public argsOfCalls: HashedValues[],
    /**
     * Transient authorization witnesses for authorizing the execution of one or more actions during this tx.
     * These witnesses are not expected to be stored in the local witnesses database of the PXE.
     */
    public authWitnesses: AuthWitness[],
    /**
     * Read-only data passed through the oracle calls during this tx execution.
     */
    public capsules: Capsule[],
    /**
     * A salt to make the tx request hash difficult to predict.
     * The hash is used as the first nullifier if there is no nullifier emitted throughout the tx.
     */
    public salt = Fr.random(),
  ) {}

  static get schema(): ZodFor<TxExecutionRequest> {
    return z
      .object({
        origin: schemas.AztecAddress,
        functionSelector: schemas.FunctionSelector,
        firstCallArgsHash: schemas.Fr,
        txContext: TxContext.schema,
        argsOfCalls: z.array(HashedValues.schema),
        authWitnesses: z.array(AuthWitness.schema),
        capsules: z.array(Capsule.schema),
        salt: schemas.Fr,
      })
      .transform(TxExecutionRequest.from);
  }

  toTxRequest(): TxRequest {
    return new TxRequest(
      this.origin,
      // Entrypoints must be private as as defined by the protocol.
      new FunctionData(this.functionSelector, true /* isPrivate */),
      this.firstCallArgsHash,
      this.txContext,
      this.salt,
    );
  }

  static getFields(fields: FieldsOf<TxExecutionRequest>) {
    return [
      fields.origin,
      fields.functionSelector,
      fields.firstCallArgsHash,
      fields.txContext,
      fields.argsOfCalls,
      fields.authWitnesses,
      fields.capsules,
      fields.salt,
    ] as const;
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
      this.functionSelector,
      this.firstCallArgsHash,
      this.txContext,
      new Vector(this.argsOfCalls),
      new Vector(this.authWitnesses),
      new Vector(this.capsules),
      this.salt,
    );
  }

  /**
   * Serialize as a string.
   * @returns The string.
   */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   * @returns The deserialized TxRequest object.
   */
  static fromBuffer(buffer: Buffer | BufferReader): TxExecutionRequest {
    const reader = BufferReader.asReader(buffer);
    return new TxExecutionRequest(
      reader.readObject(AztecAddress),
      reader.readObject(FunctionSelector),
      Fr.fromBuffer(reader),
      reader.readObject(TxContext),
      reader.readVector(HashedValues),
      reader.readVector(AuthWitness),
      reader.readVector(Capsule),
      Fr.fromBuffer(reader),
    );
  }

  /**
   * Deserializes from a string, corresponding to a write in cpp.
   * @param str - String to read from.
   * @returns The deserialized TxRequest object.
   */
  static fromString(str: string): TxExecutionRequest {
    return TxExecutionRequest.fromBuffer(hexToBuffer(str));
  }

  static async random() {
    return new TxExecutionRequest(
      await AztecAddress.random(),
      FunctionSelector.random(),
      Fr.random(),
      TxContext.empty(),
      [HashedValues.random()],
      [AuthWitness.random()],
      [
        new Capsule(await AztecAddress.random(), Fr.random(), [Fr.random(), Fr.random()]),
        new Capsule(await AztecAddress.random(), Fr.random(), [Fr.random()]),
      ],
      Fr.random(),
    );
  }

  [inspect.custom]() {
    return `TxExecutionRequest(${this.origin} called ${this.functionSelector})`;
  }
}
