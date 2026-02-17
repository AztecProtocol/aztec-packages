import { TX_START_PREFIX } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';

import { BlobDeserializationError } from '../errors.js';

// Must match the implementation in `noir-protocol-circuits/crates/types/src/blob_data/tx_blob_data.nr`.

const NUM_BLOB_FIELDS_BIT_SIZE = 32n;
const REVERT_CODE_BIT_SIZE = 8n;
const NUM_NOTE_HASH_BIT_SIZE = 16n;
const NUM_NULLIFIER_BIT_SIZE = 16n;
const NUM_L2_TO_L1_MSG_BIT_SIZE = 16n;
const NUM_PUBLIC_DATA_WRITE_BIT_SIZE = 16n;
const NUM_PRIVATE_LOG_BIT_SIZE = 16n;
const PRIVATE_LOGS_LENGTH_BIT_SIZE = 16n;
const PUBLIC_LOGS_LENGTH_BIT_SIZE = 32n;
const CONTRACT_CLASS_LOG_LENGTH_BIT_SIZE = 16n;

export interface TxStartMarker {
  numBlobFields: number;
  revertCode: number;
  numNoteHashes: number;
  numNullifiers: number;
  numL2ToL1Msgs: number;
  numPublicDataWrites: number;
  numPrivateLogs: number;
  privateLogsLength: number;
  publicLogsLength: number;
  contractClassLogLength: number;
}

export function encodeTxStartMarker(txStartMarker: TxStartMarker): Fr {
  let value = BigInt(TX_START_PREFIX);
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
  value <<= PRIVATE_LOGS_LENGTH_BIT_SIZE;
  value += BigInt(txStartMarker.privateLogsLength);
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
  const privateLogsLength = Number(value & (2n ** PRIVATE_LOGS_LENGTH_BIT_SIZE - 1n));
  value >>= PRIVATE_LOGS_LENGTH_BIT_SIZE;
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

  const prefix = value;
  if (prefix !== BigInt(TX_START_PREFIX)) {
    throw new BlobDeserializationError(`Incorrect encoding of blob fields: invalid tx start marker.`);
  }

  return {
    numBlobFields,
    revertCode,
    numNoteHashes,
    numNullifiers,
    numL2ToL1Msgs,
    numPublicDataWrites,
    numPrivateLogs,
    privateLogsLength,
    publicLogsLength,
    contractClassLogLength,
  };
}
