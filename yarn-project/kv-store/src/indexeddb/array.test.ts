import { describeAztecArray } from '../interfaces/array_test_suite.js';
import { mockLogger } from '../interfaces/utils.js';
import { AztecIndexedDBStore } from './store.js';

describe('IndexedDBArray', () => {
  describeAztecArray('AztecArray', async () => await AztecIndexedDBStore.open(mockLogger, undefined, true));
});
