import { describeAztecStore } from '../interfaces/store_test_suite.js';
import { AztecIndexedDBStore } from './store.js';
import { mockLogger } from './utils.js';

describe('AztecIndexedDBStore', () => {
  describeAztecStore(
    'AztecStore',
    async path => AztecIndexedDBStore.open(path, mockLogger, false),
    async () => AztecIndexedDBStore.open('', mockLogger, false),
    async () => AztecIndexedDBStore.open('', mockLogger, true),
  );
});
