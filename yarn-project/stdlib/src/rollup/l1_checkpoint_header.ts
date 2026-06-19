import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { bigintToUInt64BE } from '@aztec/foundation/serialize';
import { hexToBuffer } from '@aztec/foundation/string';

import { AztecAddress } from '../aztec-address/index.js';
import { GasFees } from '../gas/index.js';
import { CheckpointHeader } from './checkpoint_header.js';

/**
 * The raw, ABI-shaped form of a checkpoint header as it appears at the viem boundary: what
 * `decodeFunctionData` produces for `propose`, what `propose`/`validateHeaderWithAttestations`
 * consume, and the carrier for not-yet-validated header bytes during L1 sync.
 *
 * Unlike {@link CheckpointHeader}, the fields keep their raw wire representation (hex strings and
 * bigints) so the struct can hold values that fall outside the BN254 scalar field. A malicious
 * proposer can land such out-of-range values on L1; constructing an {@link L1CheckpointHeader} from
 * them must never throw. Converting to a {@link CheckpointHeader} (which validates the field ranges)
 * is the explicit, fallible boundary handled by {@link toCheckpointHeader} / {@link tryToCheckpointHeader}.
 *
 * Note: the field named `outHash` here is the epoch out hash; it maps to `CheckpointHeader.epochOutHash`.
 * The name is kept to match the on-chain `ProposedHeader` struct produced by viem.
 */
export type L1CheckpointHeader = {
  lastArchiveRoot: `0x${string}`;
  blockHeadersHash: `0x${string}`;
  blobsHash: `0x${string}`;
  inHash: `0x${string}`;
  outHash: `0x${string}`;
  slotNumber: bigint;
  timestamp: bigint;
  coinbase: `0x${string}`;
  feeRecipient: `0x${string}`;
  gasFees: { feePerDaGas: bigint; feePerL2Gas: bigint };
  totalManaUsed: bigint;
  accumulatedFees: bigint;
};

/** Error thrown when an {@link L1CheckpointHeader} carries field values outside the BN254 scalar field. */
export class OutOfRangeFieldError extends Error {
  constructor(public readonly fields: string[]) {
    super(`Checkpoint header has out-of-range field(s): ${fields.join(', ')}`);
    this.name = 'OutOfRangeFieldError';
  }
}

/** The Fr-valued fields of a checkpoint header that may overflow the BN254 scalar field. */
const FR_VALUED_FIELDS = [
  'lastArchiveRoot',
  'blockHeadersHash',
  'blobsHash',
  'inHash',
  'outHash',
  'feeRecipient',
  'totalManaUsed',
  'accumulatedFees',
] as const;

function bigintFromHexOrValue(value: `0x${string}` | bigint): bigint {
  return typeof value === 'bigint' ? value : BigInt(value);
}

/** Returns the names of the header fields whose value is greater than or equal to the BN254 modulus. */
export function getOutOfRangeFields(header: L1CheckpointHeader): string[] {
  return FR_VALUED_FIELDS.filter(field => bigintFromHexOrValue(header[field]) >= Fr.MODULUS);
}

/**
 * Hashes an {@link L1CheckpointHeader} using the exact byte layout of {@link CheckpointHeader.toBuffer}
 * (and the on-chain `ProposedHeaderLib.hash` `abi.encodePacked`). Because the result is a sha256 hash
 * reduced into the field, it is always in range even when some input field is not. For an in-range header
 * the result equals {@link CheckpointHeader.hash}, which is what lets us verify the payload digest of a
 * malicious header without ever constructing a {@link CheckpointHeader}.
 */
export function l1CheckpointHeaderHash(header: L1CheckpointHeader): Fr {
  // Layout must match CheckpointHeader.toBuffer and ProposedHeaderLib.hash. Each Fr-valued field is its
  // raw 32-byte big-endian value (substituted directly even when out of range), slotNumber is a 32-byte
  // field, timestamp is uint64, coinbase is 20 bytes, and the two gas fees are uint128 each.
  const buffer = Buffer.concat([
    toBufferBE(BigInt(header.lastArchiveRoot), 32),
    toBufferBE(BigInt(header.blockHeadersHash), 32),
    toBufferBE(BigInt(header.blobsHash), 32),
    toBufferBE(BigInt(header.inHash), 32),
    toBufferBE(BigInt(header.outHash), 32),
    toBufferBE(header.slotNumber, 32),
    bigintToUInt64BE(header.timestamp),
    hexToBuffer(header.coinbase),
    toBufferBE(BigInt(header.feeRecipient), 32),
    toBufferBE(header.gasFees.feePerDaGas, 16),
    toBufferBE(header.gasFees.feePerL2Gas, 16),
    toBufferBE(header.totalManaUsed, 32),
    toBufferBE(header.accumulatedFees, 32),
  ]);
  return sha256ToField([buffer]);
}

/** Converts a validated, in-range {@link CheckpointHeader} into its raw {@link L1CheckpointHeader} wire form. */
export function toL1CheckpointHeader(header: CheckpointHeader): L1CheckpointHeader {
  return {
    lastArchiveRoot: header.lastArchiveRoot.toString(),
    blockHeadersHash: header.blockHeadersHash.toString(),
    blobsHash: header.blobsHash.toString(),
    inHash: header.inHash.toString(),
    outHash: header.epochOutHash.toString(),
    slotNumber: BigInt(header.slotNumber),
    timestamp: header.timestamp,
    coinbase: header.coinbase.toString(),
    feeRecipient: `0x${header.feeRecipient.toBuffer().toString('hex').padStart(64, '0')}`,
    gasFees: {
      feePerDaGas: header.gasFees.feePerDaGas,
      feePerL2Gas: header.gasFees.feePerL2Gas,
    },
    totalManaUsed: header.totalManaUsed.toBigInt(),
    accumulatedFees: header.accumulatedFees.toBigInt(),
  };
}

/**
 * Attempts to convert a raw {@link L1CheckpointHeader} into a validated {@link CheckpointHeader}.
 * Returns the offending field names instead of throwing when any field is out of range.
 */
export function tryToCheckpointHeader(
  header: L1CheckpointHeader,
): { ok: true; header: CheckpointHeader } | { ok: false; fields: string[] } {
  const fields = getOutOfRangeFields(header);
  if (fields.length > 0) {
    return { ok: false, fields };
  }
  return {
    ok: true,
    header: new CheckpointHeader(
      Fr.fromString(header.lastArchiveRoot),
      Fr.fromString(header.blockHeadersHash),
      Fr.fromString(header.blobsHash),
      Fr.fromString(header.inHash),
      Fr.fromString(header.outHash),
      SlotNumber.fromBigInt(header.slotNumber),
      header.timestamp,
      new EthAddress(hexToBuffer(header.coinbase)),
      new AztecAddress(hexToBuffer(header.feeRecipient)),
      new GasFees(header.gasFees.feePerDaGas, header.gasFees.feePerL2Gas),
      new Fr(header.totalManaUsed),
      new Fr(header.accumulatedFees),
    ),
  };
}

/**
 * Converts a raw {@link L1CheckpointHeader} into a validated {@link CheckpointHeader}, throwing an
 * {@link OutOfRangeFieldError} carrying the offending field names when any field is out of range.
 */
export function toCheckpointHeader(header: L1CheckpointHeader): CheckpointHeader {
  const result = tryToCheckpointHeader(header);
  if (!result.ok) {
    throw new OutOfRangeFieldError(result.fields);
  }
  return result.header;
}

/** Builds a random in-range {@link L1CheckpointHeader} for testing. */
export function randomL1CheckpointHeader(overrides: Partial<L1CheckpointHeader> = {}): L1CheckpointHeader {
  return { ...toL1CheckpointHeader(CheckpointHeader.random()), ...overrides };
}

/** Returns the raw 32-byte big-endian representation of an {@link Fr} or {@link Buffer32}. */
export function archiveRootToBuffer32(archive: Fr | Buffer32): Buffer32 {
  return archive instanceof Buffer32 ? archive : Buffer32.fromField(archive);
}
