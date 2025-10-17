import { fromHex, toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { poseidon2HashBytes, randomBytes } from '@aztec/foundation/crypto';
import type { Fr } from '@aztec/foundation/fields';
import { type ZodFor, hexSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, TypeRegistry } from '@aztec/foundation/serialize';

import type { ABIParameter } from './abi.js';
import { decodeFunctionSignature } from './decoder.js';
import { Selector } from './selector.js';

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

/**
 * Function selector branding.
 * @remarks
 * This interface uses TypeScript's declaration merging to provide nominal typing,
 * ensuring FunctionSelectors cannot be accidentally used where other selector types are expected.
 */
export interface FunctionSelector {
  /** Brand. */
  _branding: 'FunctionSelector';
}

/**
 * A function selector uniquely identifies a function within a contract.
 *
 * Function selectors are 4-byte identifiers computed by hashing the function signature
 * (name and parameter types) using Poseidon2. They are used for:
 * - Routing function calls to the correct implementation
 * - Identifying functions in logs and events
 * - Efficient function dispatch in contracts
 *
 * @remarks
 * Unlike Ethereum which uses Keccak256, Aztec uses Poseidon2 (a ZK-friendly hash)
 * and takes the last 4 bytes of the hash result.
 *
 * The signature format excludes parameter names and whitespace:
 * - Correct: `transfer(field,field)`
 * - Incorrect: `transfer(field, field)` or `transfer(from: field, to: field)`
 *
 * @example
 * ```typescript
 * // Create from signature
 * const selector = await FunctionSelector.fromSignature('transfer(field,field)');
 *
 * // Create from name and ABI parameters
 * const params: ABIParameter[] = [
 *   { name: 'from', type: { kind: 'field' }, visibility: 'private' },
 *   { name: 'to', type: { kind: 'field' }, visibility: 'private' }
 * ];
 * const selector = await FunctionSelector.fromNameAndParameters('transfer', params);
 *
 * // Deserialize from storage
 * const selector = FunctionSelector.fromString('0x12345678');
 * const selector = FunctionSelector.fromBuffer(buffer);
 * ```
 */
export class FunctionSelector extends Selector {
  /**
   * Deserializes a function selector from a buffer or reader.
   * @param buffer - Buffer or BufferReader containing the 4-byte selector
   * @returns The deserialized FunctionSelector instance
   * @remarks Reads exactly 4 bytes in big-endian format
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    const value = Number(toBigIntBE(reader.readBytes(Selector.SIZE)));
    return new FunctionSelector(value);
  }

  /**
   * Converts a field element to a function selector.
   * @param fr - The field element to convert
   * @returns The function selector
   * @remarks Useful when receiving selectors from circuits
   */
  static fromField(fr: Fr) {
    return new FunctionSelector(Number(fr.toBigInt()));
  }

  /**
   * Reads a function selector from a field array or reader.
   * @param fields - Field array or FieldReader to read from
   * @returns The function selector
   * @remarks Consumes one field from the reader
   */
  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return FunctionSelector.fromField(reader.readField());
  }

  /**
   * Creates a function selector from a function signature string.
   *
   * @param signature - Function signature (e.g., "transfer(field,field)")
   * @returns The computed function selector
   * @throws If the signature contains whitespace
   *
   * @remarks
   * The signature must:
   * - Use Noir type names (field, u8, bool, etc.)
   * - Have no spaces: `transfer(field,field)` not `transfer(field, field)`
   * - Include parameter types but not names
   *
   * The selector is computed by:
   * 1. Computing Poseidon2 hash of the signature string
   * 2. Taking the last 4 bytes of the hash
   *
   * @example
   * ```typescript
   * const selector = await FunctionSelector.fromSignature('transfer(field,field)');
   * const complexSelector = await FunctionSelector.fromSignature(
   *   'processData([field;10],u64,bool)'
   * );
   * ```
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
   * Creates a function selector from a hex-encoded string.
   *
   * @param selector - The hex-encoded string (with or without 0x prefix)
   * @returns The FunctionSelector instance
   * @throws If the hex string is not exactly 4 bytes
   *
   * @example
   * ```typescript
   * const selector = FunctionSelector.fromString('0x12345678');
   * const selector = FunctionSelector.fromString('12345678');
   * ```
   */
  static fromString(selector: string) {
    const buf = fromHex(selector);
    if (buf.length !== Selector.SIZE) {
      throw new Error(`Invalid FunctionSelector length ${buf.length} (expected ${Selector.SIZE}).`);
    }
    return FunctionSelector.fromBuffer(buf);
  }

  /**
   * Creates an empty (zero) function selector.
   * @returns A selector with value 0
   * @remarks Used as a placeholder or null value
   */
  static empty() {
    return new FunctionSelector(0);
  }

  /**
   * Creates a function selector from a function name and ABI parameters.
   *
   * @param name - The function name
   * @param parameters - Array of ABI parameter definitions
   * @returns The computed function selector
   *
   * @remarks
   * This is the preferred method when working with contract artifacts,
   * as it automatically generates the correct signature from the ABI.
   *
   * @example
   * ```typescript
   * const params: ABIParameter[] = [
   *   { name: 'amount', type: { kind: 'field' }, visibility: 'private' },
   *   { name: 'recipient', type: { kind: 'field' }, visibility: 'private' }
   * ];
   * const selector = await FunctionSelector.fromNameAndParameters('transfer', params);
   *
   * // Also supports object form
   * const selector = await FunctionSelector.fromNameAndParameters({
   *   name: 'transfer',
   *   parameters: params
   * });
   * ```
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
   * Creates a random function selector.
   * @returns A selector with a random 4-byte value
   * @remarks Useful for testing and mock data generation
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
