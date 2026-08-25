import { CURSOR_PAGE_SIZE, Database, type LMDBMessageChannel, LMDBMessageType } from './message.js';

/**
 * Reads against the store. When constructed with the id of a native read transaction, every read and iteration is
 * routed through it, so they all observe the same snapshot; otherwise each operation reads whatever is committed at
 * the time it runs.
 */
export class ReadTransaction {
  protected open = true;

  constructor(
    protected channel: LMDBMessageChannel,
    protected readonly txId?: number,
  ) {}

  public close(): void {
    if (!this.open) {
      return;
    }
    this.open = false;
  }

  protected assertIsOpen() {
    if (!this.open) {
      throw new Error('Transaction is closed');
    }
  }

  public async get(key: Uint8Array): Promise<Uint8Array | undefined> {
    this.assertIsOpen();
    const response = await this.channel.sendMessage(LMDBMessageType.GET, {
      keys: [key],
      db: Database.DATA,
      txId: this.txId ?? null,
    });
    return response.values[0]?.[0] ?? undefined;
  }

  public async getIndex(key: Uint8Array): Promise<Uint8Array[]> {
    this.assertIsOpen();
    const response = await this.channel.sendMessage(LMDBMessageType.GET, {
      keys: [key],
      db: Database.INDEX,
      txId: this.txId ?? null,
    });
    return response.values[0] ?? [];
  }

  public async *iterate(
    startKey: Uint8Array,
    endKey?: Uint8Array,
    reverse = false,
    limit?: number,
  ): AsyncIterable<[Uint8Array, Uint8Array]> {
    yield* this.#iterate(Database.DATA, startKey, endKey, reverse, limit, vals => vals[0]);
  }

  public async *iterateIndex(
    startKey: Uint8Array,
    endKey?: Uint8Array,
    reverse = false,
    limit?: number,
  ): AsyncIterable<[Uint8Array, Uint8Array[]]> {
    yield* this.#iterate(Database.INDEX, startKey, endKey, reverse, limit, vals => vals);
  }

  public countEntries(startKey: Uint8Array, endKey: Uint8Array, reverse: boolean): Promise<number> {
    return this.#countEntries(Database.DATA, startKey, endKey, reverse);
  }

  public countEntriesIndex(startKey: Uint8Array, endKey: Uint8Array, reverse: boolean): Promise<number> {
    return this.#countEntries(Database.INDEX, startKey, endKey, reverse);
  }

  async *#iterate<T>(
    db: string,
    startKey: Uint8Array,
    endKey: Uint8Array | undefined,
    reverse: boolean,
    limit: number | undefined,
    map: (val: Uint8Array[]) => T,
  ): AsyncIterable<[Uint8Array, T]> {
    this.assertIsOpen();

    let cursor: number | undefined;
    try {
      const response = await this.channel.sendMessage(LMDBMessageType.START_CURSOR, {
        key: startKey,
        reverse,
        count: typeof limit === 'number' ? Math.min(limit, CURSOR_PAGE_SIZE) : CURSOR_PAGE_SIZE,
        onePage: typeof limit === 'number' && limit < CURSOR_PAGE_SIZE,
        db,
        txId: this.txId ?? null,
      });

      cursor = response.cursor ?? undefined;
      let entries = response.entries;
      let done = typeof cursor !== 'number';
      let count = 0;
      // emit the first page and any subsequent pages in a while loop
      // NB: end contition is in the middle of the while loop
      while (entries.length > 0) {
        for (const [key, values] of entries) {
          if (typeof limit === 'number' && count >= limit) {
            done = true;
            break;
          }

          if (endKey) {
            const cmp = Buffer.compare(key, endKey);
            if ((!reverse && cmp >= 0) || (reverse && cmp <= 0)) {
              done = true;
              break;
            }
          }

          count++;
          yield [key, map(values)];
        }

        // cursor is null if DB returned everything in the first page
        if (typeof cursor !== 'number' || done) {
          break;
        }

        const response = await this.channel.sendMessage(LMDBMessageType.ADVANCE_CURSOR, {
          cursor,
          count: CURSOR_PAGE_SIZE,
        });

        done = response.done;
        entries = response.entries;
      }
    } finally {
      // we might not have anything to close
      if (typeof cursor === 'number') {
        await this.channel.sendMessage(LMDBMessageType.CLOSE_CURSOR, { cursor });
      }
    }
  }

  async #countEntries(db: string, startKey: Uint8Array, endKey: Uint8Array, reverse: boolean): Promise<number> {
    this.assertIsOpen();

    let cursor: number | undefined;
    try {
      const response = await this.channel.sendMessage(LMDBMessageType.START_CURSOR, {
        key: startKey,
        reverse,
        count: 0,
        onePage: false,
        db,
        txId: this.txId ?? null,
      });

      cursor = response.cursor ?? undefined;
      if (!cursor) {
        return 0;
      }

      const advanceResponse = await this.channel.sendMessage(LMDBMessageType.ADVANCE_CURSOR_COUNT, {
        cursor,
        endKey: endKey,
      });

      return advanceResponse.count;
    } finally {
      // we might not have anything to close
      if (typeof cursor === 'number') {
        await this.channel.sendMessage(LMDBMessageType.CLOSE_CURSOR, { cursor });
      }
    }
  }
}
