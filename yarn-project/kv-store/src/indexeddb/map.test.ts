import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { mockLogger } from '../interfaces/utils.js';
import { AztecIndexedDBStore } from './store.js';

describe('IndexedDBMap', () => {
  describeAztecMap('AztecMap', async () => await AztecIndexedDBStore.open(mockLogger, undefined, true));
});
