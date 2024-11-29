import { describeAztecStore } from '../interfaces/store_test_suite.js';
import { AztecIndexedDBStore } from './store.js';
import { mockLogger } from './utils.js';

describe('AztecIndexedDBStore', () => {
  describeAztecStore(
    'AztecStore',
    async () => AztecIndexedDBStore.open(mockLogger, 'test', false),
    async () => AztecIndexedDBStore.open(mockLogger, undefined, false),
    async () => AztecIndexedDBStore.open(mockLogger, undefined, true),
  );
});
