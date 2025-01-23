import { describeAztecStore } from '../interfaces/store_test_suite.js';
import { mockLogger } from '../interfaces/utils.js';
import { AztecIndexedDBStore } from './store.js';

describe('AztecIndexedDBStore', () => {
  describeAztecStore(
    'AztecStore',
    async () => await AztecIndexedDBStore.open(mockLogger, 'test', false),
    async () => await AztecIndexedDBStore.open(mockLogger, undefined, false),
    async () => await AztecIndexedDBStore.open(mockLogger, undefined, true),
  );
});
