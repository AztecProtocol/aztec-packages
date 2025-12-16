import { fromHex, toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { poseidon2HashBytes, randomBytes } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import { type ZodFor, hexSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, TypeRegistry } from '@aztec/foundation/serialize';

import type { ABIParameter } from './abi.js';
import { decodeFunctionSignature } from './decoder.js';
import { Selector } from './selector.js';

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

/** Function selector branding */
export interface FunctionSelector {
  /** Brand. */
  _branding: 'FunctionSelector';
}

/** A function selector is the first 4 bytes of the hash of a function signature. */
export class FunctionSelector extends Selector {
  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer  or BufferReader to read from.
   * @returns The Selector.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const value = Number(toBigIntBE(reader.readBytes(Selector.SIZE)));
    return new FunctionSelector(value);
  }

  /**
   * Converts a field to selector.
   * @param fr - The field to convert.
   * @returns The selector.
   */
  static fromField(fr: Fr) {
    return new FunctionSelector(Number(fr.toBigInt()));
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return FunctionSelector.fromField(reader.readField());
  }

  /**
   * Creates a selector from a signature.
   * @param signature - Signature to generate the selector for (e.g. "transfer(field,field)").
   * @returns selector.
   */
  static async fromSignature(signature: string) {
    // throw if signature contains whitespace
    if (/\s/.test(signature)) {
      throw new Error('Signature cannot contain whitespace');
    }
    const hash = await poseidon2HashBytes(Buffer.from(signature));
    // We take the last Selector.SIZE big endian bytes
    const bytes = hash.toBuffer().slice(-Selector.SIZE);
    return FunctionSelector.fromBuffer(bytes);
  }

  /**
   * Create a Selector instance from a hex-encoded string.
   *
   * @param selector - The hex-encoded string representing the Selector.
   * @returns An Selector instance.
   * @throws If the selector length is invalid.
   */
  static fromString(selector: string) {
    const buf = fromHex(selector);
    if (buf.length !== Selector.SIZE) {
      throw new Error(`Invalid FunctionSelector length ${buf.length} (expected ${Selector.SIZE}).`);
    }
    return FunctionSelector.fromBuffer(buf);
  }

  /**
   * Creates an empty selector.
   * @returns An empty selector.
   */
  static empty() {
    return new FunctionSelector(0);
  }

  /**
   * Creates a function selector for a given function name and parameters.
   * @param name - The name of the function.
   * @param parameters - An array of ABIParameter objects, each containing the type information of a function parameter.
   * @returns A Buffer containing the 4-byte selector.
   */
  static fromNameAndParameters(args: { name: string; parameters: ABIParameter[] }): Promise<FunctionSelector>;
  static fromNameAndParameters(name: string, parameters: ABIParameter[]): Promise<FunctionSelector>;
  static async fromNameAndParameters(
    nameOrArgs: string | { name: string; parameters: ABIParameter[] },
    maybeParameters?: ABIParameter[],
  ): Promise<FunctionSelector> {
    const { name, parameters } =
      typeof nameOrArgs === 'string' ? { name: nameOrArgs, parameters: maybeParameters! } : nameOrArgs;
    const signature = decodeFunctionSignature(name, parameters);
    const selector = await this.fromSignature(signature);
    // If using the debug logger here it kill the typing in the `server_world_state_synchronizer` and jest tests.
    // console.log(`selector for ${signature} is ${selector}`);
    return selector;
  }

  /**
   * Creates a random instance.
   */
  static random() {
    return FunctionSelector.fromBuffer(randomBytes(Selector.SIZE));
  }

  toJSON() {
    return this.toString();
  }

  static get schema(): ZodFor<FunctionSelector> {
    return hexSchemaFor(FunctionSelector);
  }
}

// For deserializing JSON.
TypeRegistry.register('FunctionSelector', FunctionSelector);
