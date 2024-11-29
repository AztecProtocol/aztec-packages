import { describeAztecStore } from '../interfaces/store_test_suite.js';
import { AztecIndexedDBStore } from './store.js';
import { mockLogger } from './utils.js';

describe('AztecIndexedDBStore', () => {
  describeAztecStore(
    'AztecStore',
    async path => AztecIndexedDBStore.open(mockLogger, path, false),
    async () => AztecIndexedDBStore.open(mockLogger, undefined, false),
    async () => AztecIndexedDBStore.open(mockLogger, undefined, true),
  );
});
