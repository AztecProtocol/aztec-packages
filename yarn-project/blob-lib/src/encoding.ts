import { BLOCK_END_PREFIX, TX_START_PREFIX } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';

const NUM_BLOB_FIELDS_BIT_SIZE = 32n;
const REVERT_CODE_BIT_SIZE = 8n;
const NUM_NOTE_HASH_BIT_SIZE = 16n;
const NUM_NULLIFIER_BIT_SIZE = 16n;
const NUM_L2_TO_L1_MSG_BIT_SIZE = 16n;
const NUM_PUBLIC_DATA_WRITE_BIT_SIZE = 16n;
const NUM_PRIVATE_LOG_BIT_SIZE = 16n;
const PUBLIC_LOGS_LENGTH_BIT_SIZE = 32n;
const CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE = 16n;

export interface TxStartMarker {
  prefix: bigint;
  numBlobFields: number;
  revertCode: number;
  numNoteHashes: number;
  numNullifiers: number;
  numL2ToL1Msgs: number;
  numPublicDataWrites: number;
  numPrivateLogs: number;
  publicLogsLength: number;
  contractClassLogLength: number;
}

// Must match the implementation in `noir-protocol-circuits/crates/rollup-lib/src/tx_base/components/tx_blob_data.nr`.
export function encodeTxStartMarker(txStartMarker: Omit<TxStartMarker, 'prefix'>) {
  let value = TX_START_PREFIX;
  value <<= NUM_NOTE_HASH_BIT_SIZE;
  value += BigInt(txStartMarker.numNoteHashes);
  value <<= NUM_NULLIFIER_BIT_SIZE;
  value += BigInt(txStartMarker.numNullifiers);
  value <<= NUM_L2_TO_L1_MSG_BIT_SIZE;
  value += BigInt(txStartMarker.numL2ToL1Msgs);
  value <<= NUM_PUBLIC_DATA_WRITE_BIT_SIZE;
  value += BigInt(txStartMarker.numPublicDataWrites);
  value <<= NUM_PRIVATE_LOG_BIT_SIZE;
  value += BigInt(txStartMarker.numPrivateLogs);
  value <<= PUBLIC_LOGS_LENGTH_BIT_SIZE;
  value += BigInt(txStartMarker.publicLogsLength);
  value <<= CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE;
  value += BigInt(txStartMarker.contractClassLogLength);
  value <<= REVERT_CODE_BIT_SIZE;
  value += BigInt(txStartMarker.revertCode);
  value <<= NUM_BLOB_FIELDS_BIT_SIZE;
  value += BigInt(txStartMarker.numBlobFields);
  return new Fr(value);
}

export function decodeTxStartMarker(field: Fr): TxStartMarker {
  let value = field.toBigInt();
  const numBlobFields = Number(value & (2n ** NUM_BLOB_FIELDS_BIT_SIZE - 1n));
  value >>= NUM_BLOB_FIELDS_BIT_SIZE;
  const revertCode = Number(value & (2n ** REVERT_CODE_BIT_SIZE - 1n));
  value >>= REVERT_CODE_BIT_SIZE;
  const contractClassLogLength = Number(value & (2n ** CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE - 1n));
  value >>= CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE;
  const publicLogsLength = Number(value & (2n ** PUBLIC_LOGS_LENGTH_BIT_SIZE - 1n));
  value >>= PUBLIC_LOGS_LENGTH_BIT_SIZE;
  const numPrivateLogs = Number(value & (2n ** NUM_PRIVATE_LOG_BIT_SIZE - 1n));
  value >>= NUM_PRIVATE_LOG_BIT_SIZE;
  const numPublicDataWrites = Number(value & (2n ** NUM_PUBLIC_DATA_WRITE_BIT_SIZE - 1n));
  value >>= NUM_PUBLIC_DATA_WRITE_BIT_SIZE;
  const numL2ToL1Msgs = Number(value & (2n ** NUM_L2_TO_L1_MSG_BIT_SIZE - 1n));
  value >>= NUM_L2_TO_L1_MSG_BIT_SIZE;
  const numNullifiers = Number(value & (2n ** NUM_NULLIFIER_BIT_SIZE - 1n));
  value >>= NUM_NULLIFIER_BIT_SIZE;
  const numNoteHashes = Number(value & (2n ** NUM_NOTE_HASH_BIT_SIZE - 1n));
  value >>= NUM_NOTE_HASH_BIT_SIZE;
  // Do not throw if the prefix doesn't match.
  // The caller function can check it by calling `isValidTxStartMarker`, and decide what to do if it's incorrect.
  const prefix = value;
  return {
    prefix,
    numBlobFields,
    revertCode,
    numNoteHashes,
    numNullifiers,
    numL2ToL1Msgs,
    numPublicDataWrites,
    numPrivateLogs,
    publicLogsLength,
    contractClassLogLength,
  };
}

export function getNumBlobFieldsFromTxStartMarker(field: Fr) {
  return Number(field.toBigInt() & (2n ** NUM_BLOB_FIELDS_BIT_SIZE - 1n));
}

export function isValidTxStartMarker(txStartMarker: TxStartMarker) {
  return txStartMarker.prefix === TX_START_PREFIX;
}

export function createBlockEndMarker(numTxs: number) {
  // Must match the implementation in `block_rollup_public_inputs_composer.nr > create_block_end_marker`.
  return new Fr(BLOCK_END_PREFIX * 256n * 256n + BigInt(numTxs));
}

export function getNumTxsFromBlockEndMarker(field: Fr) {
  return Number(field.toBigInt() & 0xffffn);
}

export function isBlockEndMarker(field: Fr) {
  const value = field.toBigInt();
  const numTxs = value & 0xffffn;
  return value - numTxs === BLOCK_END_PREFIX * 256n * 256n;
}
