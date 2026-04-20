import { describeAztecArray } from '../interfaces/array_test_suite.js';
import { mockLogger } from '../interfaces/utils.js';
import { AztecSQLiteOPFSStore } from './store.js';

describe('SQLiteOPFSArray', () => {
  describeAztecArray('AztecArray', async () => await AztecSQLiteOPFSStore.open(mockLogger, undefined, true));
});
