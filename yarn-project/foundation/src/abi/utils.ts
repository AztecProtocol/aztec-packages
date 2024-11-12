import { type AbiType } from './abi.js';

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
