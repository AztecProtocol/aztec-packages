import { describeAztecMultiMap } from '../interfaces/multi_map_test_suite.js';
import { mockLogger } from '../interfaces/utils.js';
import { AztecIndexedDBStore } from './store.js';

describe('IndexedDBMap', () => {
  describeAztecMultiMap('AztecMultiMap', async () => await AztecIndexedDBStore.open(mockLogger, undefined, true));
});
