import { describe } from 'mocha';

import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { openTmpStore } from './index.js';

describe('LMDBMap', () => {
  describeAztecMap('AztecMap', async () => openTmpStore(true));
});
