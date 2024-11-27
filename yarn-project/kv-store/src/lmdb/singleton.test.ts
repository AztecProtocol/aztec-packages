import { describeAztecSingleton } from '../interfaces/singleton_test_suite.js';
import { openTmpJungleStore } from '../utils.js';

describe('LMDBSingleton', () => {
  describeAztecSingleton('AztecSingleton', async () => openTmpJungleStore(true));
});
