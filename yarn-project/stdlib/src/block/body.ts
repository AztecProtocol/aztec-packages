import type { TxBlobData } from '@aztec/blob-lib/encoding';
import { timesParallel } from '@aztec/foundation/collection';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';
import { z } from 'zod';

import type { ZodFor } from '../schemas/index.js';
import { TxEffect } from '../tx/tx_effect.js';

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
  toTxBlobData(): TxBlobData[] {
    return this.txEffects.map(txEffect => txEffect.toTxBlobData());
  }

  /**
   * Decodes a block from blob fields.
   */
  static fromTxBlobData(txBlobData: TxBlobData[]): Body {
    const txEffects = txBlobData.map(data => TxEffect.fromTxBlobData(data));
    return new Body(txEffects);
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
