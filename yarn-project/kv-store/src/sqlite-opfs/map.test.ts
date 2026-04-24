import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { mockLogger } from '../interfaces/utils.js';
import { AztecSQLiteOPFSStore } from './store.js';

describe('SQLiteOPFSMap', () => {
  describeAztecMap('AztecMap', async () => await AztecSQLiteOPFSStore.open(mockLogger, undefined, true));
});
