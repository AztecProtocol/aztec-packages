import { type Fr } from '@aztec/circuits.js';
import { timesParallel } from '@aztec/foundation/collection';
import { type ZodFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

import { ContractClass2BlockL2Logs } from './logs/index.js';
import { TxEffect } from './tx_effect.js';

export class Body {
  constructor(public txEffects: TxEffect[]) {
    txEffects.forEach(txEffect => {
      if (txEffect.isEmpty()) {
        throw new Error('Empty tx effect not allowed in Body');
      }
    });
  }

  static get schema(): ZodFor<Body> {
    return z
      .object({
        txEffects: z.array(TxEffect.schema),
      })
      .transform(({ txEffects }) => new Body(txEffects));
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
  static fromBlobFields(fields: Fr[], contractClassLogs?: ContractClass2BlockL2Logs) {
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
      .map((effect, i) => TxEffect.fromBlobFields(effect, contractClassLogs?.txLogs[i]));
    return new this(txEffects);
  }

  [inspect.custom]() {
    return `Body {
  txEffects: ${inspect(this.txEffects)},
}`;
  }

  get contractClassLogs(): ContractClass2BlockL2Logs {
    const logs = this.txEffects.map(txEffect => txEffect.contractClassLogs);

    return new ContractClass2BlockL2Logs(logs);
  }

  static async random(txsPerBlock = 4, numPublicCallsPerTx = 3, numPublicLogsPerCall = 1) {
    const txEffects = await timesParallel(txsPerBlock, () =>
      TxEffect.random(numPublicCallsPerTx, numPublicLogsPerCall),
    );

    return new Body(txEffects);
  }

  static empty() {
    return new Body([]);
  }
}
