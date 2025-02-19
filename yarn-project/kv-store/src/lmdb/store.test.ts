import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describeAztecStore } from '../interfaces/store_test_suite.js';
import { AztecLmdbStore } from './store.js';

const defaultMapSize = 1024 * 1024 * 1024 * 10;

describe('AztecLmdbStore', () => {
  describeAztecStore(
    'AztecStore',
    async () => {
      const path = await fs.mkdtemp(join(tmpdir(), 'aztec-store-test-'));
      return AztecLmdbStore.open(path, defaultMapSize, false);
    },
    () => Promise.resolve(AztecLmdbStore.open(undefined, defaultMapSize, false)),
    () => Promise.resolve(AztecLmdbStore.open(undefined, defaultMapSize, true)),
  );
});
