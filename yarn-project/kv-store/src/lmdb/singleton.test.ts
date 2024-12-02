import { describeAztecSingleton } from '../interfaces/singleton_test_suite.js';
import { openTmpStore } from './index.js';

describe('LMDBSingleton', () => {
  describeAztecSingleton('Sync AztecSingleton', async () => openTmpStore(true));

  describeAztecSingleton('Async AztecSingleton', async () => openTmpStore(true), true);
});
