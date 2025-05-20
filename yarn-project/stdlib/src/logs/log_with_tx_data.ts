import { MAX_NOTE_HASHES_PER_TX, PUBLIC_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { TxHash } from '@aztec/stdlib/tx';

// TypeScript representation of the Noir aztec::oracle::message_discovery::LogWithTxData struct. This is used as a
// response for PXE's custom getLogByTag oracle.
export class LogWithTxData {
  constructor(
    // The emitted fields of a log.
    // For public logs, the contract address is prepended to the content.
    public logContent: Fr[],
    public txHash: TxHash,
    public uniqueNoteHashesInTx: Fr[],
    public firstNullifierInTx: Fr,
  ) {}

  toNoirSerialization(): (Fr | Fr[])[] {
    return [
      // The log fields length is PUBLIC_LOG_SIZE_IN_FIELDS. + 1 because the contract address is prepended to the content.
      // This is only used for public logs currently, so the maxLength is PUBLIC_LOG_SIZE_IN_FIELDS + 1.
      // TODO(#11639): this could also be used for private logs.
      ...toBoundedVecSerialization(this.logContent, PUBLIC_LOG_SIZE_IN_FIELDS + 1),
      this.txHash.hash,
      ...toBoundedVecSerialization(this.uniqueNoteHashesInTx, MAX_NOTE_HASHES_PER_TX),
      this.firstNullifierInTx,
    ];
  }

  static noirSerializationOfEmpty(): (Fr | Fr[])[] {
    return new LogWithTxData([], TxHash.zero(), [], new Fr(0)).toNoirSerialization();
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
