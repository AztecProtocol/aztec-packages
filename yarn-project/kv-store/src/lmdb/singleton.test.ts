import { describeAztecSingleton } from '../interfaces/singleton_test_suite.js';
import { openTmpStore } from './index.js';

describe('LMDBSingleton', () => {
  describeAztecSingleton('Sync AztecSingleton', () => openTmpStore(true));

  describeAztecSingleton('Async AztecSingleton', () => Promise.resolve(openTmpStore(true)), true);
});
