import { MAX_NOTE_HASHES_PER_TX, PUBLIC_LOG_PLAINTEXT_LEN } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { TxHash } from '@aztec/stdlib/tx';

// TypeScript representation of the Noir aztec::oracle::message_processing::PublicLogWithTxData struct. This is used as a
// response for PXE's custom getPublicLogByTag oracle.
export class PublicLogWithTxData {
  constructor(
    // The emitted fields of a log.
    public logPlaintext: Fr[],
    public txHash: TxHash,
    public uniqueNoteHashesInTx: Fr[],
    public firstNullifierInTx: Fr,
  ) {}

  toNoirSerialization(): (Fr | Fr[])[] {
    return [
      ...toBoundedVecSerialization(this.logPlaintext, PUBLIC_LOG_PLAINTEXT_LEN),
      this.txHash.hash,
      ...toBoundedVecSerialization(this.uniqueNoteHashesInTx, MAX_NOTE_HASHES_PER_TX),
      this.firstNullifierInTx,
    ];
  }

  static noirSerializationOfEmpty(): (Fr | Fr[])[] {
    return new PublicLogWithTxData([], TxHash.zero(), [], new Fr(0)).toNoirSerialization();
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
