import { chunk } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';

import { BlobDeserializationError } from '../errors.js';
import { type TxStartMarker, decodeTxStartMarker, encodeTxStartMarker } from './tx_start_marker.js';

// Must match the implementation in noir-protocol-circuits/crates/types/src/blob_data/tx_blob_data.nr.

export interface TxBlobData {
  txStartMarker: TxStartMarker;
  txHash: Fr;
  transactionFee: Fr;
  noteHashes: Fr[];
  nullifiers: Fr[];
  l2ToL1Msgs: Fr[];
  publicDataWrites: [Fr, Fr][];
  privateLogs: Fr[][];
  publicLogs: Fr[];
  contractClassLog: Fr[];
}

export function encodeTxBlobData(txBlobData: TxBlobData): Fr[] {
  return [
    encodeTxStartMarker(txBlobData.txStartMarker),
    txBlobData.txHash,
    txBlobData.transactionFee,
    ...txBlobData.noteHashes,
    ...txBlobData.nullifiers,
    ...txBlobData.l2ToL1Msgs,
    ...txBlobData.publicDataWrites.flat(),
    ...txBlobData.privateLogs.map(log => [new Fr(log.length), ...log]).flat(),
    ...txBlobData.publicLogs,
    ...txBlobData.contractClassLog,
  ];
}

export function decodeTxBlobData(fields: Fr[] | FieldReader): TxBlobData {
  const reader = FieldReader.asReader(fields);

  if (reader.isFinished()) {
    throw new BlobDeserializationError(`Incorrect encoding of blob fields: not enough fields for tx blob data.`);
  }

  const txStartMarker = decodeTxStartMarker(reader.readField());

  const checkRemainingFields = (requiredFields: number, type: string) => {
    if (requiredFields > reader.remainingFields()) {
      throw new BlobDeserializationError(
        `Incorrect encoding of blob fields: not enough fields for ${type}. Expected ${requiredFields} fields, only ${reader.remainingFields()} remaining.`,
      );
    }
  };

  const numTxEffectFields = txStartMarker.numBlobFields - 1; // -1 because we already read the tx start marker.
  checkRemainingFields(numTxEffectFields, 'tx effect');

  const txHash = reader.readField();
  const transactionFee = reader.readField();

  checkRemainingFields(txStartMarker.numNoteHashes, 'note hashes');
  const noteHashes = reader.readFieldArray(txStartMarker.numNoteHashes);

  checkRemainingFields(txStartMarker.numNullifiers, 'nullifiers');
  const nullifiers = reader.readFieldArray(txStartMarker.numNullifiers);

  checkRemainingFields(txStartMarker.numL2ToL1Msgs, 'l2-to-l1 messages');
  const l2ToL1Msgs = reader.readFieldArray(txStartMarker.numL2ToL1Msgs);

  checkRemainingFields(txStartMarker.numPublicDataWrites * 2, 'public data writes'); // *2 for leaf slot and value
  const publicDataWrites = chunk(reader.readFieldArray(txStartMarker.numPublicDataWrites * 2), 2) as [Fr, Fr][];

  const privateLogs = Array.from({ length: txStartMarker.numPrivateLogs }, () => {
    const length = reader.readU32();
    checkRemainingFields(length, 'private log');
    return reader.readFieldArray(length);
  });

  checkRemainingFields(txStartMarker.publicLogsLength, 'public logs');
  const publicLogs = reader.readFieldArray(txStartMarker.publicLogsLength);

  const contractClassLogBlobDataLength =
    txStartMarker.contractClassLogLength > 0 ? txStartMarker.contractClassLogLength + 1 : 0; // If the log exists, +1 for the contract address
  checkRemainingFields(contractClassLogBlobDataLength, 'contract class logs');
  const contractClassLog = reader.readFieldArray(contractClassLogBlobDataLength);

  return {
    txStartMarker,
    txHash,
    transactionFee,
    noteHashes,
    nullifiers,
    l2ToL1Msgs,
    publicDataWrites,
    privateLogs,
    publicLogs,
    contractClassLog,
  };
}

export function getNumTxBlobFields(txStartMarker: Omit<TxStartMarker, 'revertCode' | 'numBlobFields'>) {
  return (
    1 + // tx start marker
    1 + // tx hash
    1 + // transaction fee
    txStartMarker.numNoteHashes +
    txStartMarker.numNullifiers +
    txStartMarker.numL2ToL1Msgs +
    txStartMarker.numPublicDataWrites * 2 + // *2 for leaf slot and value per public data write
    txStartMarker.numPrivateLogs + // +1 length field for each private log
    txStartMarker.privateLogsLength +
    txStartMarker.publicLogsLength +
    txStartMarker.contractClassLogLength +
    (txStartMarker.contractClassLogLength > 0 ? 1 : 0) // +1 for contract address of the contract class log
  );
}
