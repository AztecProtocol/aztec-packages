import { describeAztecSingleton } from '../interfaces/singleton_test_suite.js';
import { openTmpStore } from './index.js';

describe('LMDBSingleton', () => {
  describeAztecSingleton('AztecSingleton', async () => openTmpStore(true));
});
