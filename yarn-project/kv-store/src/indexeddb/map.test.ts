import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { AztecIndexedDBStore } from './store.js';
import { mockLogger } from './utils.js';

describe('IndexedDBMap', () => {
  describeAztecMap('AztecMap', async () => AztecIndexedDBStore.open('test', mockLogger, true));
});
