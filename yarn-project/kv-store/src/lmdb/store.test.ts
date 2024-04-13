import { addStoreTests } from '../tests/aztec_store_tests.js';
import { AztecLmdbStore } from './store.js';

describe('AztecLmdbStore', () => {
  addStoreTests(() => AztecLmdbStore.open());
});
