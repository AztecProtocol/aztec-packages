import { describeAztecSingleton } from '../interfaces/singleton_test_suite.js';
import { openTmpStore } from '../utils.js';

describe('JungleDBSingleton', () => {
  describeAztecSingleton('AztecSingleton', async () => openTmpStore(true));
});
