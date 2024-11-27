import { describeAztecStore } from '../interfaces/store_test_suite.js';
import { AztecLmdbStore } from './store.js';

const defaultMapSize = 1024 * 1024 * 1024 * 10;

describe('AztecLmdbStore', () => {
  describeAztecStore(
    'AztecStore',
    async path => AztecLmdbStore.open(path, defaultMapSize, false),
    async () => AztecLmdbStore.open(undefined, defaultMapSize, false),
    async () => AztecLmdbStore.open(undefined, defaultMapSize, true),
  );
});
