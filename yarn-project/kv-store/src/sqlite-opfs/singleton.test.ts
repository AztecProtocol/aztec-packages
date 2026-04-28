import { describeAztecSingleton } from '../interfaces/singleton_test_suite.js';
import { mockLogger } from '../interfaces/utils.js';
import { AztecSQLiteOPFSStore } from './store.js';

describe('SQLiteOPFSSingleton', () => {
  describeAztecSingleton('AztecSingleton', async () => await AztecSQLiteOPFSStore.open(mockLogger, undefined, true));
});
