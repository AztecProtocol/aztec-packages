import { describeAztecArray } from '../interfaces/array_test_suite.js';
import { AztecIndexedDBStore } from './store.js';
import { mockLogger } from './utils.js';

describe('IndexedDBArray', () => {
  describeAztecArray('AztecArray', async () => AztecIndexedDBStore.open(mockLogger, undefined, true));
});
