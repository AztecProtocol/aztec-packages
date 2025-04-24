import { describeAztecMultiMap } from '../interfaces/multi_map_test_suite.js';
import { openTmpStore } from './index.js';

describe('LMDBMultiMap', () => {
  describeAztecMultiMap('Sync AztecMultiMap', () => openTmpStore(true));

  describeAztecMultiMap('Async AztecMultiMap', () => Promise.resolve(openTmpStore(true)), true);
});
