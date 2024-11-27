import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { openTmpStore } from '../utils.js';

describe('LMDBMap', () => {
  describeAztecMap('AztecMap', async () => openTmpStore(true));
});
