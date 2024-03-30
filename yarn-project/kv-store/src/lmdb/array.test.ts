import { type Database, open } from 'lmdb';

import { addArrayTests } from '../tests/aztec_array_tests.js';
import { LmdbAztecArray } from './array.js';

describe('LmdbAztecArray', () => {
  let db: Database;

  beforeEach(() => {
    db = open({} as any);
  });

  addArrayTests(() => new LmdbAztecArray(db, 'test'));
});
