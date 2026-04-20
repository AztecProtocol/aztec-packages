import { describeAztecMultiMap } from '../interfaces/multi_map_test_suite.js';
import { mockLogger } from '../interfaces/utils.js';
import { AztecSQLiteOPFSStore } from './store.js';

describe('SQLiteOPFSMultiMap', () => {
  describeAztecMultiMap('AztecMultiMap', async () => await AztecSQLiteOPFSStore.open(mockLogger, undefined, true));
});
