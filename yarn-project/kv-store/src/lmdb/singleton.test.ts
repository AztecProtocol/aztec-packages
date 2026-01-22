import { createLogger } from '@aztec/foundation/log';

import { describeAztecSingleton } from '../interfaces/singleton_test_suite.js';
import { openTmpStore } from './index.js';

const logger = createLogger('kv-store:lmdb:test');

describe('LMDBSingleton', () => {
  describeAztecSingleton('Sync AztecSingleton', () => openTmpStore(logger, true));

  describeAztecSingleton('Async AztecSingleton', () => Promise.resolve(openTmpStore(logger, true)), true);
});
