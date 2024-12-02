import { describeAztecSingleton } from '../interfaces/singleton_test_suite.js';
import { mockLogger } from '../interfaces/utils.js';
import { AztecIndexedDBStore } from './store.js';

describe('IndexedDBSingleton', () => {
  describeAztecSingleton('AztecSingleton', async () => await AztecIndexedDBStore.open(mockLogger, undefined, true));
});
