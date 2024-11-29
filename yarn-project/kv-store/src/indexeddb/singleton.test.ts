import { describeAztecSingleton } from '../interfaces/singleton_test_suite.js';
import { AztecIndexedDBStore } from './store.js';
import { mockLogger } from './utils.js';

describe('IndexedDBSingleton', () => {
  describeAztecSingleton('AztecSingleton', async () => AztecIndexedDBStore.open(mockLogger, undefined, true));
});
