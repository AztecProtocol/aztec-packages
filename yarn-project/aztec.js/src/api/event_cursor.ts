import { type BlockNumber, BlockNumberSchema } from '@aztec/foundation/branded-types';
import { LogCursor } from '@aztec/stdlib/logs';
import { schemas } from '@aztec/stdlib/schemas';

import { z } from 'zod';

/**
 * Opaque cursor marking a position in a contract's public event stream. Obtain one from
 * {@link GetPublicEventsResult.nextCursor} and pass it back as {@link PublicEventFilter.afterEvent} to
 * fetch the next page.
 *
 * This is the public-events counterpart of the node-layer {@link LogCursor}
 **/
export class EventCursor {
  constructor(
    /** The block the cursor points to. */
    public readonly blockNumber: BlockNumber,
    /** The tx index within the block the cursor points to. */
    public readonly txIndexWithinBlock: number,
    /** The log index within the tx the cursor points to. */
    public readonly logIndexWithinTx: number,
  ) {}

  static get schema() {
    return z
      .object({
        blockNumber: BlockNumberSchema,
        txIndexWithinBlock: schemas.Integer,
        logIndexWithinTx: schemas.Integer,
      })
      .transform(
        ({ blockNumber, txIndexWithinBlock, logIndexWithinTx }) =>
          new EventCursor(blockNumber, txIndexWithinBlock, logIndexWithinTx),
      );
  }

  /**
   * Bridges from the node-layer {@link LogCursor}. Explicit on purpose — see the class doc.
   * @param cursor - The node-layer cursor to wrap.
   */
  static fromLogCursor(cursor: LogCursor): EventCursor {
    return new EventCursor(cursor.blockNumber, cursor.txIndexWithinBlock, cursor.logIndexWithinTx);
  }

  /** Bridges to the node-layer {@link LogCursor}. Explicit on purpose — see the class doc. */
  toLogCursor(): LogCursor {
    return new LogCursor(this.blockNumber, this.txIndexWithinBlock, this.logIndexWithinTx);
  }

  equals(other: EventCursor): boolean {
    return (
      this.blockNumber === other.blockNumber &&
      this.txIndexWithinBlock === other.txIndexWithinBlock &&
      this.logIndexWithinTx === other.logIndexWithinTx
    );
  }

  toString(): string {
    return `${this.blockNumber}-${this.txIndexWithinBlock}-${this.logIndexWithinTx}`;
  }
}
