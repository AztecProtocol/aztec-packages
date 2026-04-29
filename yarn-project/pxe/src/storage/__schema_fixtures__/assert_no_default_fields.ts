import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';

/**
 * Throws if any own-enumerable property of `value` equals a known default
 * sentinel. Used by schema-fixture builders to guarantee every field
 * contributes distinguishable bytes to the snapshot.
 *
 * Heuristic — won't catch every type-specific default. The buffer-length
 * field of the schema snapshot is the backstop.
 */
export function assertNoDefaultFields(typeName: string, value: object): void {
  for (const [key, field] of Object.entries(value)) {
    if (isDefault(field)) {
      throw new Error(
        `Fixture for ${typeName} is incomplete: field '${key}' is the type default ` +
          `(${describe(field)}). Set it to a distinguishable non-default value.`,
      );
    }
  }
}

function isDefault(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (value === 0 || value === 0n || value === '') {
    return true;
  }
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  if (value instanceof Fr && value.isZero()) {
    return true;
  }
  if (value instanceof EthAddress && value.isZero()) {
    return true;
  }
  return false;
}

function describe(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'empty array';
  }
  if (typeof value === 'bigint') {
    return `${value}n`;
  }
  if (typeof value === 'string') {
    return "''";
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (value instanceof Fr) {
    return 'Fr.ZERO';
  }
  if (value instanceof EthAddress) {
    return 'EthAddress.ZERO';
  }
  return 'default';
}
