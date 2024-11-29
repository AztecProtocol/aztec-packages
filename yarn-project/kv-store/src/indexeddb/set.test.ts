import { describeAztecSet } from '../interfaces/set_test_suite.js';
import { AztecIndexedDBStore } from './store.js';
import { mockLogger } from './utils.js';

describe('IndexedDBSet', () => {
  describeAztecSet('AztecSet', async () => AztecIndexedDBStore.open(mockLogger, undefined, true));
});
