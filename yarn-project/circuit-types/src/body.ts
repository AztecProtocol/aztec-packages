import {
  EncryptedL2BlockL2Logs,
  EncryptedNoteL2BlockL2Logs,
  TxEffect,
  UnencryptedL2BlockL2Logs,
} from '@aztec/circuit-types';
import { type Fr } from '@aztec/circuits.js';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';

export class Body {
  constructor(public txEffects: TxEffect[]) {
    txEffects.forEach(txEffect => {
      if (txEffect.isEmpty()) {
        throw new Error('Empty tx effect not allowed in Body');
      }
    });
  }

  /**
   * Serializes a block body
   * @returns A serialized L2 block body.
   */
  toBuffer() {
    return serializeToBuffer(this.txEffects.length, this.txEffects);
  }

  /**
   * Deserializes a block from a buffer
   * @returns A deserialized L2 block.
   */
  static fromBuffer(buf: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buf);

    return new this(reader.readVector(TxEffect));
  }

  /**
   * Returns a flat packed array of fields of all tx effects - used for blobs.
   */
  toFields() {
    let flattened: Fr[] = [];
    this.txEffects.forEach((effect: TxEffect) => {
      flattened = flattened.concat(effect.toFields());
    });
    return flattened;
  }

  /**
   * Decodes a block from blob fields.
   * TODO(#8954): When logs are refactored into fields, we won't need to inject them here, instead just reading from fields in TxEffect.fromFields.
   * Logs are best input by gathering from the getters below, as they don't remove empty log arrays.
   */
  static fromFields(
    fields: Fr[],
    noteEncryptedLogs?: EncryptedNoteL2BlockL2Logs,
    encryptedLogs?: EncryptedL2BlockL2Logs,
    unencryptedLogs?: UnencryptedL2BlockL2Logs,
  ) {
    // TODO(Miranda): Probably also encode a length per tx in the first (revertcode) elt to avoid doing the below
    const txEffectsFields: Fr[][] = [];
    let startIndex = -1;
    fields.forEach((field, i) => {
      if (
        // Checking that we start with the revert code...
        TxEffect.fromPrefix(field).type == 1 &&
        // ... and the value is a valid revert code..
        TxEffect.fromPrefix(field).length < 4 &&
        // ... and the next value is a tx fee:
        fields[i + 1].toBuffer().readUint8(1) == 2
      ) {
        if (startIndex !== -1) {
          // push each tx effect's fields
          txEffectsFields.push(fields.slice(startIndex, i));
        }
        startIndex = i;
      }
    });
    // push the final tx effect's fields
    txEffectsFields.push(fields.slice(startIndex, fields.length));
    const txEffects = txEffectsFields.map((effect, i) =>
      TxEffect.fromFields(effect, noteEncryptedLogs?.txLogs[i], encryptedLogs?.txLogs[i], unencryptedLogs?.txLogs[i]),
    );
    return new this(txEffects);
  }

  [inspect.custom]() {
    return `Body {
  txEffects: ${inspect(this.txEffects)},
  emptyTxEffectsCount: ${this.numberOfTxsIncludingPadded},
}`;
  }

  get noteEncryptedLogs(): EncryptedNoteL2BlockL2Logs {
    const logs = this.txEffects.map(txEffect => txEffect.noteEncryptedLogs);

    return new EncryptedNoteL2BlockL2Logs(logs);
  }

  get encryptedLogs(): EncryptedL2BlockL2Logs {
    const logs = this.txEffects.map(txEffect => txEffect.encryptedLogs);

    return new EncryptedL2BlockL2Logs(logs);
  }

  get unencryptedLogs(): UnencryptedL2BlockL2Logs {
    const logs = this.txEffects.map(txEffect => txEffect.unencryptedLogs);

    return new UnencryptedL2BlockL2Logs(logs);
  }

  /**
   * Computes the number of transactions in the block including padding transactions.
   * @dev Modified code from TxsDecoder.computeNumTxEffectsToPad
   */
  get numberOfTxsIncludingPadded() {
    const numTxEffects = this.txEffects.length;

    // 2 is the minimum number of tx effects
    if (numTxEffects <= 2) {
      return 2;
    }

    return numTxEffects;
  }

  static random(
    txsPerBlock = 4,
    numPrivateCallsPerTx = 2,
    numPublicCallsPerTx = 3,
    numEncryptedLogsPerCall = 2,
    numUnencryptedLogsPerCall = 1,
  ) {
    const txEffects = [...new Array(txsPerBlock)].map(_ =>
      TxEffect.random(numPrivateCallsPerTx, numPublicCallsPerTx, numEncryptedLogsPerCall, numUnencryptedLogsPerCall),
    );

    return new Body(txEffects);
  }

  static empty() {
    return new Body([]);
  }
}
