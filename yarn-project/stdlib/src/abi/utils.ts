import type { AbiType } from './abi.js';

/**
 * Returns whether the ABI type is an Aztec or Ethereum Address defined in Aztec.nr.
 * @param abiType - Type to check.
 * @returns Boolean.
 */
export function isAddressStruct(abiType: AbiType) {
  return isEthAddressStruct(abiType) || isAztecAddressStruct(abiType);
}

/**
 * Returns whether the ABI type is an Ethereum Address defined in Aztec.nr.
 * @param abiType - Type to check.
 * @returns Boolean.
 */
export function isEthAddressStruct(abiType: AbiType) {
  return abiType.kind === 'struct' && abiType.path.endsWith('address::EthAddress');
}

/**
 * Returns whether the ABI type is an Aztec Address defined in Aztec.nr.
 * @param abiType - Type to check.
 * @returns Boolean.
 */
export function isAztecAddressStruct(abiType: AbiType) {
  return abiType.kind === 'struct' && abiType.path.endsWith('address::AztecAddress');
}

/**
 * Returns whether the ABI type is an Function Selector defined in Aztec.nr.
 * @param abiType - Type to check.
 * @returns Boolean.
 */
export function isFunctionSelectorStruct(abiType: AbiType) {
  return abiType.kind === 'struct' && abiType.path.endsWith('types::abis::function_selector::FunctionSelector');
}

/**
 * Returns whether the ABI type is a struct with a single `inner` field.
 * @param abiType - Type to check.
 */
export function isWrappedFieldStruct(abiType: AbiType) {
  return (
    abiType.kind === 'struct' &&
    abiType.fields.length === 1 &&
    abiType.fields[0].name === 'inner' &&
    abiType.fields[0].type.kind === 'field'
  );
}

/**
 * Returns whether the ABI type is a PublicKeys struct from Aztec.nr.
 * @param abiType - Type to check.
 * @returns A boolean indicating whether the ABI type is a PublicKeys struct.
 */
export function isPublicKeysStruct(abiType: AbiType) {
  return (
    abiType.kind === 'struct' &&
    abiType.path === 'aztec::protocol_types::public_keys::PublicKeys' &&
    abiType.fields.length === 6 &&
    abiType.fields[0].name === 'npk_m_hash' &&
    abiType.fields[1].name === 'ivpk_m' &&
    abiType.fields[2].name === 'ovpk_m_hash' &&
    abiType.fields[3].name === 'tpk_m_hash' &&
    abiType.fields[4].name === 'mspk_m_hash' &&
    abiType.fields[5].name === 'fbpk_m_hash'
  );
}

/**
 * Returns whether the ABI type is a BoundedVec struct from Noir's std::collections::bounded_vec.
 * @param abiType - Type to check.
 * @returns A boolean indicating whether the ABI type is a BoundedVec struct.
 */
export function isBoundedVecStruct(abiType: AbiType) {
  return (
    abiType.kind === 'struct' &&
    abiType.path === 'std::collections::bounded_vec::BoundedVec' &&
    abiType.fields.length === 2 &&
    abiType.fields[0].name === 'storage' &&
    abiType.fields[1].name === 'len'
  );
}

/**
 * Returns whether the ABI type is Noir's std::option::Option lowered to a struct.
 * @param abiType - Type to check.
 * @returns A boolean indicating whether the ABI type is an Option struct.
 */
export function isOptionStruct(abiType: AbiType) {
  return (
    abiType.kind === 'struct' &&
    abiType.path === 'std::option::Option' &&
    abiType.fields.length === 2 &&
    abiType.fields[0].name === '_is_some' &&
    abiType.fields[1].name === '_value'
  );
}

/**
 * Returns whether `null` or `undefined` can be mapped to a valid ABI value for this type.
 *
 * @param abiType - Type to check.
 * @returns A boolean indicating whether nullish values are valid shorthand for this ABI type.
 */
export function canBeMappedFromNullOrUndefined(abiType: AbiType) {
  return isOptionStruct(abiType);
}

/**
 * Returns a bigint by parsing a serialized 2's complement signed int.
 * @param b - The signed int as a buffer
 * @returns - a deserialized bigint
 */
export function parseSignedInt(b: Buffer, width?: number) {
  const buf = Buffer.from(b);

  // We get the last (width / 8) bytes where width = bits of type (i64, i32 etc)
  const slicedBuf = width !== undefined ? buf.subarray(-(width / 8)) : buf;

  // Then manually deserialize with 2's complement, with the process as follows:

  // If our most significant bit is high...
  if (0x80 & slicedBuf.subarray(0, 1).readUInt8()) {
    // We flip the bits
    for (let i = 0; i < slicedBuf.length; i++) {
      slicedBuf[i] = ~slicedBuf[i];
    }

    // Add one, then negate it
    return -(BigInt(`0x${slicedBuf.toString('hex')}`) + 1n);
  }

  // ...otherwise we just return our positive int
  return BigInt(`0x${slicedBuf.toString('hex')}`);
}
