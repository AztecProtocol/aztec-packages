import { Fr } from '@aztec/foundation/fields';

import { MAX_NOTE_HASHES_PER_TX, PUBLIC_LOG_DATA_SIZE_IN_FIELDS } from '../constants.gen.js';

// TypeScript representation of the Noir protocol_types::log_with_tx_data::LogWithTxData struct.
export class LogWithTxData {
  constructor(
    public logContent: Fr[],
    public txHash: Fr,
    public uniqueNoteHashesInTx: Fr[],
    public firstNullifierInTx: Fr,
  ) {}

  toNoirSerialization(): (Fr | Fr[])[] {
    return [
      ...toBoundedVecSerialization(this.logContent, PUBLIC_LOG_DATA_SIZE_IN_FIELDS),
      this.txHash,
      ...toBoundedVecSerialization(this.uniqueNoteHashesInTx, MAX_NOTE_HASHES_PER_TX),
      this.firstNullifierInTx,
    ];
  }

  static noirSerializationOfEmpty(): (Fr | Fr[])[] {
    return new LogWithTxData([], new Fr(0), [], new Fr(0)).toNoirSerialization();
  }
}

function toBoundedVecSerialization(array: Fr[], maxLength: number) {
  if (array.length > maxLength) {
    throw new Error(
      `An array of length ${array.length} cannot be converted to a BoundedVec of max length ${maxLength}`,
    );
  }

  return [array.concat(Array(maxLength - array.length).fill(new Fr(0))), new Fr(array.length)];
}
