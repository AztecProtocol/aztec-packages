import { type Fr } from '@aztec/circuits.js';
import { BLOBS_PER_BLOCK, FIELDS_PER_BLOB } from '@aztec/constants';
import { timesParallel } from '@aztec/foundation/collection';
import { type ZodFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

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
    if (flattened.length > BLOBS_PER_BLOCK * FIELDS_PER_BLOB) {
      throw new Error(
        `Attempted to overfill block's blobs with ${flattened.length} elements. The maximum is ${
          BLOBS_PER_BLOCK * FIELDS_PER_BLOB
        }`,
      );
    }

    return flattened;
  }

  /**
   * Decodes a block from blob fields.
   */
  static fromBlobFields(fields: Fr[]) {
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
    const txEffects = txEffectsFields.filter(effect => effect.length).map(effect => TxEffect.fromBlobFields(effect));
    return new this(txEffects);
  }

  [inspect.custom]() {
    return `Body {
  txEffects: ${inspect(this.txEffects)},
}`;
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
