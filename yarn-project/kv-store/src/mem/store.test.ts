import { addStoreTests } from '../tests/aztec_store_tests.js';
import { AztecMemStore } from './store.js';

describe('AztecMemStore', () => {
  addStoreTests(() => new AztecMemStore());
});
