import { MAX_NOTE_HASHES_PER_TX, PRIVATE_LOG_CIPHERTEXT_LEN, PUBLIC_LOG_PLAINTEXT_LEN } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { TxHash } from '@aztec/stdlib/tx';

// TypeScript representation of the Noir aztec::oracle::message_processing::LogWithTxData<N> struct. This is used as a
// response for PXE's custom getPublicLogByTag and getPrivateLogByTag oracles.
class LogWithTxData<N extends number> {
  constructor(
    public logPayload: Fr[],
    public txHash: TxHash,
    public uniqueNoteHashesInTx: Fr[],
    public firstNullifierInTx: Fr,
    private maxLogContentLength: N,
  ) {}

  toNoirSerialization(): (Fr | Fr[])[] {
    return [
      ...toBoundedVecSerialization(this.logPayload, this.maxLogContentLength),
      this.txHash.hash,
      ...toBoundedVecSerialization(this.uniqueNoteHashesInTx, MAX_NOTE_HASHES_PER_TX),
      this.firstNullifierInTx,
    ];
  }
}

// This is used as a response for PXE's custom getPublicLogByTag oracle.
export class PublicLogWithTxData extends LogWithTxData<typeof PUBLIC_LOG_PLAINTEXT_LEN> {
  constructor(logContent: Fr[], txHash: TxHash, uniqueNoteHashesInTx: Fr[], firstNullifierInTx: Fr) {
    super(logContent, txHash, uniqueNoteHashesInTx, firstNullifierInTx, PUBLIC_LOG_PLAINTEXT_LEN);
  }

  static noirSerializationOfEmpty(): (Fr | Fr[])[] {
    return new PublicLogWithTxData([], TxHash.zero(), [], new Fr(0)).toNoirSerialization();
  }
}

// This is used as a response for PXE's custom getPrivateLogByTag oracle.
export class PrivateLogWithTxData extends LogWithTxData<typeof PRIVATE_LOG_CIPHERTEXT_LEN> {
  constructor(logContent: Fr[], txHash: TxHash, uniqueNoteHashesInTx: Fr[], firstNullifierInTx: Fr) {
    super(logContent, txHash, uniqueNoteHashesInTx, firstNullifierInTx, PRIVATE_LOG_CIPHERTEXT_LEN);
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
