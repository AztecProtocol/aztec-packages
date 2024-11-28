import { describe } from 'mocha';

import { describeAztecSingleton } from '../interfaces/singleton_test_suite.js';
import { openTmpStore } from './index.js';

describe('IndexedDBSingleton', () => {
  describeAztecSingleton('AztecSingleton', async () => openTmpStore(true));
});
