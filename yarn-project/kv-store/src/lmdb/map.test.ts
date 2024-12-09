import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { openTmpStore } from './index.js';

describe('LMDBMap', () => {
  describeAztecMap('Sync AztecMap', () => openTmpStore(true));

  describeAztecMap('Async AztecMap', () => Promise.resolve(openTmpStore(true)), true);
});
