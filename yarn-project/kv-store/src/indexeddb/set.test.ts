import { describeAztecSet } from '../interfaces/set_test_suite.js';
import { mockLogger } from '../interfaces/utils.js';
import { AztecIndexedDBStore } from './store.js';

describe('IndexedDBSet', () => {
  describeAztecSet('AztecSet', async () => await AztecIndexedDBStore.open(mockLogger, undefined, true));
});
