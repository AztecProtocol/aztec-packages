import { CURSOR_PAGE_SIZE, Database, LMDBMessageType, TypeSafeMessageChannel } from './message.js';

export class ReadTransaction {
  protected open = true;

  constructor(protected channel: TypeSafeMessageChannel) {}

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
    const { response } = await this.channel.sendMessage(LMDBMessageType.GET, { keys: [key], db: Database.DATA });
    return response.values[0]?.[0] ?? undefined;
  }

  public async getIndex(key: Uint8Array): Promise<Uint8Array[]> {
    this.assertIsOpen();
    const { response } = await this.channel.sendMessage(LMDBMessageType.GET, { keys: [key], db: Database.INDEX });
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

  async *#iterate<T>(
    db: string,
    startKey: Uint8Array,
    endKey: Uint8Array | undefined,
    reverse: boolean,
    limit: number | undefined,
    map: (val: Uint8Array[]) => T,
  ): AsyncIterable<[Uint8Array, T]> {
    this.assertIsOpen();

    const {
      response: { cursor },
    } = await this.channel.sendMessage(LMDBMessageType.START_CURSOR, {
      key: startKey,
      reverse,
      db,
    });

    if (typeof cursor !== 'number') {
      // there's nothing in the db to iterate on
      return;
    }

    let done = false;
    let count = 0;
    try {
      do {
        const { response: it } = await this.channel.sendMessage(LMDBMessageType.ADVANCE_CURSOR, {
          cursor,
          count: CURSOR_PAGE_SIZE,
        });
        done = it.done;
        for (const [key, values] of it.entries) {
          if (endKey) {
            const cmp = Buffer.compare(key, endKey);
            if ((!reverse && cmp >= 0) || (reverse && cmp <= 0)) {
              done = true;
              break;
            }
          }

          if (typeof limit === 'number' && count >= limit) {
            done = true;
            break;
          }

          count++;
          yield [key, map(values)];
        }
      } while (!done);
    } finally {
      await this.channel.sendMessage(LMDBMessageType.CLOSE_CURSOR, { cursor });
    }
  }
}
