import { createBlockEndMarker, getNumTxsFromBlockEndMarker, isBlockEndMarker } from '@aztec/blob-lib/encoding';
import { BLOBS_PER_BLOCK, FIELDS_PER_BLOB } from '@aztec/constants';
import { timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

import type { ZodFor } from '../schemas/index.js';
import { TxEffect } from '../tx/tx_effect.js';

export { createBlockEndMarker };

export function getBlockBlobFields(txEffects: TxEffect[]) {
  const blobFields = txEffects.flatMap(txEffect => txEffect.toBlobFields());
  blobFields.push(createBlockEndMarker(txEffects.length));
  return blobFields;
}

export class Body {
  constructor(public txEffects: TxEffect[]) {}

  equals(other: Body) {
    return (
      this.txEffects.length === other.txEffects.length && this.txEffects.every((te, i) => te.equals(other.txEffects[i]))
    );
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
    const flattened = getBlockBlobFields(this.txEffects);

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
    const txEffects: TxEffect[] = [];
    const reader = new FieldReader(fields.slice(0, -1));
    while (!reader.isFinished()) {
      txEffects.push(TxEffect.fromBlobFields(reader));
    }

    if (!isBlockEndMarker(fields[fields.length - 1])) {
      throw new Error('Block end marker not found');
    }

    const numTxs = getNumTxsFromBlockEndMarker(fields[fields.length - 1]);
    if (numTxs !== txEffects.length) {
      throw new Error(`Expected ${numTxs} txs, but got ${txEffects.length}`);
    }

    return new this(txEffects);
  }

  [inspect.custom]() {
    return `Body {
  txEffects: ${inspect(this.txEffects)},
}`;
  }

  static async random(
    txsPerBlock = 4,
    numPublicCallsPerTx = 3,
    numPublicLogsPerCall = 1,
    maxEffects: number | undefined = undefined,
  ) {
    const txEffects = await timesParallel(txsPerBlock, () =>
      TxEffect.random(numPublicCallsPerTx, numPublicLogsPerCall, maxEffects),
    );

    return new Body(txEffects);
  }

  static empty() {
    return new Body([]);
  }
}
