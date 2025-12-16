import { MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_CIPHERTEXT_LEN } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { TxHash } from '@aztec/stdlib/tx';

// This is used as a response for PXE's custom getPublicLogByTag oracle.
export class PublicLogWithTxData {
  constructor(
    public logPayload: Fr[],
    public txHash: TxHash,
    public uniqueNoteHashesInTx: Fr[],
    public firstNullifierInTx: Fr,
  ) {}
}

// This is used as a response for PXE's custom getPrivateLogByTag oracle.
export class PrivateLogWithTxData {
  constructor(
    public logPayload: Fr[],
    public txHash: TxHash,
    public uniqueNoteHashesInTx: Fr[],
    public firstNullifierInTx: Fr,
  ) {}

  toNoirSerialization(): (Fr | Fr[])[] {
    return [
      ...toBoundedVecSerialization(this.logPayload, PRIVATE_LOG_CIPHERTEXT_LEN),
      this.txHash.hash,
      ...toBoundedVecSerialization(this.uniqueNoteHashesInTx, MAX_NOTE_HASHES_PER_TX),
      this.firstNullifierInTx,
    ];
  }

  static noirSerializationOfEmpty(): (Fr | Fr[])[] {
    return new PrivateLogWithTxData([], TxHash.zero(), [], new Fr(0)).toNoirSerialization();
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
