import { type Fr } from '@aztec/circuits.js';
import { Blob } from '@aztec/foundation/blob';
import { sha256Trunc } from '@aztec/foundation/crypto';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

import {
  ContractClass2BlockL2Logs,
  EncryptedL2BlockL2Logs,
  EncryptedNoteL2BlockL2Logs,
  UnencryptedL2BlockL2Logs,
} from './logs/index.js';
import { TxEffect } from './tx_effect.js';

export class Body {
  constructor(public txEffects: TxEffect[]) {
    txEffects.forEach(txEffect => {
      if (txEffect.isEmpty()) {
        throw new Error('Empty tx effect not allowed in Body');
      }
    });
  }

  static get schema() {
    return z
      .object({
        txEffects: z.array(TxEffect.schema),
      })
      .transform(({ txEffects }) => new Body(txEffects));
  }

  toJSON() {
    return { txEffects: this.txEffects };
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
  toBlobFields() {
    let flattened: Fr[] = [];
    this.txEffects.forEach((effect: TxEffect) => {
      flattened = flattened.concat(effect.toBlobFields());
    });
    return flattened;
  }

  /**
   * Decodes a block from blob fields.
   * TODO(#8954): When logs are refactored into fields, we won't need to inject them here, instead just reading from fields in TxEffect.fromBlobFields.
   * Logs are best input by gathering from the getters below, as they don't remove empty log arrays.
   */
  static fromBlobFields(
    fields: Fr[],
    noteEncryptedLogs?: EncryptedNoteL2BlockL2Logs,
    encryptedLogs?: EncryptedL2BlockL2Logs,
    unencryptedLogs?: UnencryptedL2BlockL2Logs,
    contractClassLogs?: ContractClass2BlockL2Logs,
  ) {
    const txEffectsFields: Fr[][] = [];
    let checkedFields = 0;
    while (checkedFields !== fields.length) {
      if (!TxEffect.isFirstField(fields[checkedFields])) {
        throw new Error('Invalid fields given to Body.fromBlobFields(): First field invalid.');
      }
      const len = TxEffect.decodeFirstField(fields[checkedFields]).length;
      txEffectsFields.push(fields.slice(checkedFields, checkedFields + len));
      checkedFields += len;
    }
    const txEffects = txEffectsFields
      .filter(effect => effect.length)
      .map((effect, i) =>
        TxEffect.fromBlobFields(
          effect,
          noteEncryptedLogs?.txLogs[i],
          encryptedLogs?.txLogs[i],
          unencryptedLogs?.txLogs[i],
          contractClassLogs?.txLogs[i],
        ),
      );
    return new this(txEffects);
  }

  [inspect.custom]() {
    return `Body {
  txEffects: ${inspect(this.txEffects)},
  emptyTxEffectsCount: ${this.numberOfTxsIncludingPadded},
}`;
  }

  /**
   * Computes the blobsHash as used in the header.
   * This hash is also computed in the Rollup contract.
   * @returns The blobs hash.
   */
  getBlobsHash() {
    const blobs = Blob.getBlobs(this.toBlobFields());
    const blobHashesBuffer = serializeToBuffer(blobs.map(b => b.getEthVersionedBlobHash()));
    return sha256Trunc(blobHashesBuffer);
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

  get contractClassLogs(): ContractClass2BlockL2Logs {
    const logs = this.txEffects.map(txEffect => txEffect.contractClassLogs);

    return new ContractClass2BlockL2Logs(logs);
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
