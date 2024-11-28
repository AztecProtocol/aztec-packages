import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { openTmpStore } from './index.js';

describe('IndexedDBMap', () => {
  describeAztecMap('AztecMap', async () => openTmpStore(true));
});
