import { randomBytes } from '@aztec/foundation/crypto';
import { toArray } from '@aztec/foundation/iterable';

import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import fs from 'fs/promises';
import { type Database, open } from 'lmdb';
import forEach from 'mocha-each';
import { tmpdir } from 'os';
import path from 'path';

import { LmdbAztecCounter } from './counter.js';

use(chaiAsPromised);

describe('LmdbAztecCounter', () => {
  let db: Database;
  let dir: string;

  beforeEach(async () => {
    dir = path.join(tmpdir(), randomBytes(8).toString('hex'));
    await fs.mkdir(dir, { recursive: true });
    db = open({ path: dir } as any);
  });

  afterEach(async () => {
    await db.drop();
    await db.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  forEach([
    ['floating point number', () => Math.random()],
    ['integers', () => (Math.random() * 1000) | 0],
    ['strings', () => randomBytes(8).toString('hex')],
    ['strings', () => [Math.random(), randomBytes(8).toString('hex')]],
  ]).describe('counts occurrences of %s values', (_, genKey) => {
    let counter: LmdbAztecCounter<ReturnType<typeof genKey>>;
    beforeEach(() => {
      counter = new LmdbAztecCounter(db, 'test');
    });

    it('returns 0 for unknown keys', () => {
      expect(counter.get(genKey())).to.equal(0);
    });

    it('increments values', async () => {
      const key = genKey();
      await counter.update(key, 1);

      expect(counter.get(key)).to.equal(1);
    });

    it('decrements values', async () => {
      const key = genKey();
      await counter.update(key, 1);
      await counter.update(key, -1);

      expect(counter.get(key)).to.equal(0);
    });

    it('throws when decrementing below zero', async () => {
      const key = genKey();
      await counter.update(key, 1);

      await expect(counter.update(key, -2)).to.be.rejected;
    });

    it('increments values by a delta', async () => {
      const key = genKey();
      await counter.update(key, 1);
      await counter.update(key, 2);

      expect(counter.get(key)).to.equal(3);
    });

    it('resets the counter', async () => {
      const key = genKey();
      await counter.update(key, 1);
      await counter.update(key, 2);
      await counter.set(key, 0);

      expect(counter.get(key)).to.equal(0);
    });

    it('iterates over entries', async () => {
      const key = genKey();
      await counter.update(key, 1);
      await counter.update(key, 2);

      expect(await toArray(counter.entries())).to.deep.equal([[key, 3]]);
    });
  });

  forEach([
    [
      [
        ['c', 2342],
        ['a', 8],
        ['b', 1],
      ],
      [
        ['a', 8],
        ['b', 1],
        ['c', 2342],
      ],
    ],
    [
      [
        [10, 2],
        [18, 1],
        [1, 2],
      ],
      [
        [1, 2],
        [10, 2],
        [18, 1],
      ],
    ],
    [
      [
        [[10, 'a'], 1],
        [[10, 'c'], 2],
        [[11, 'b'], 1],
        [[9, 'f'], 1],
        [[10, 'b'], 1],
      ],
      [
        [[9, 'f'], 1],
        [[10, 'a'], 1],
        [[10, 'b'], 1],
        [[10, 'c'], 2],
        [[11, 'b'], 1],
      ],
    ],
  ]).it('iterates in key order', async (insertOrder: [string, number][], expectedOrder) => {
    const counter = new LmdbAztecCounter(db, 'test');
    await Promise.all(insertOrder.map(([key, value]) => counter.update(key, value as number)));
    expect(await toArray(counter.entries())).to.deep.equal(expectedOrder);
  });
});
