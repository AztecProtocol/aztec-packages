import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Fr } from '@aztec/foundation/fields';
import type { EventSelector, FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * Any type that can be converted into a field element for use in contract calls.
 * Accepts Fr instances, Buffers, bigints, numbers, or objects with a toField method.
 */
export type FieldLike = Fr | Buffer | bigint | number | { /** Converts to field */ toField: () => Fr };

/**
 * Any type that can be converted into an EthAddress struct for use in Aztec.nr contracts.
 * Accepts either an EthAddress instance or an object with an address field.
 */
export type EthAddressLike = { /** Wrapped address */ address: FieldLike } | EthAddress;

/**
 * Any type that can be converted into an AztecAddress struct for use in Aztec.nr contracts.
 * Accepts either an AztecAddress instance or an object with an address field.
 */
export type AztecAddressLike = { /** Wrapped address */ address: FieldLike } | AztecAddress;

/**
 * Any type that can be converted into a FunctionSelector struct for use in Aztec.nr contracts.
 * Accepts either a FunctionSelector instance or any FieldLike value.
 */
export type FunctionSelectorLike = FieldLike | FunctionSelector;

/**
 * Any type that can be converted into an EventSelector struct for use in Aztec.nr contracts.
 * Accepts either an EventSelector instance or any FieldLike value.
 */
export type EventSelectorLike = FieldLike | EventSelector;

/**
 * Any type that can be converted into an unsigned 128-bit integer.
 * Accepts either a bigint or number value.
 */
export type U128Like = bigint | number;

/**
 * Any type that can be converted into a struct with a single `inner` field for wrapped field values.
 * Accepts either a FieldLike value directly or an object with an inner field.
 */
export type WrappedFieldLike = { /** Wrapped value */ inner: FieldLike } | FieldLike;
