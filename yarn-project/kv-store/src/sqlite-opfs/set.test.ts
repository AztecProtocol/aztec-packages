import { describeAztecSet } from '../interfaces/set_test_suite.js';
import { mockLogger } from '../interfaces/utils.js';
import { AztecSQLiteOPFSStore } from './store.js';

describe('SQLiteOPFSSet', () => {
  describeAztecSet('AztecSet', async () => await AztecSQLiteOPFSStore.open(mockLogger, undefined, true));
});
