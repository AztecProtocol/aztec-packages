import { type Database, open } from 'lmdb';

import { addMapTests } from '../tests/aztec_map_tests.js';
import { LmdbAztecMap } from './map.js';

describe('LmdbAztecMap', () => {
  let db: Database;

  beforeEach(() => {
    db = open({ dupSort: true } as any);
  });

  addMapTests(() => new LmdbAztecMap(db, 'test'));
});
