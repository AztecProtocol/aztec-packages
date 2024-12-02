import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { openTmpStore } from './index.js';

describe('LMDBMap', () => {
  describeAztecMap('Sync AztecMap', async () => openTmpStore(true));

  describeAztecMap('Async AztecMap', async () => openTmpStore(true), true);
});
