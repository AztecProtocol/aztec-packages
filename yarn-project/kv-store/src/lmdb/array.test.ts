import { createLogger } from '@aztec/foundation/log';

import { describeAztecArray } from '../interfaces/array_test_suite.js';
import { openTmpStore } from './index.js';

const logger = createLogger('kv-store:lmdb:test');

describe('LMDBArray', () => {
  describeAztecArray('Sync AztecArray', () => openTmpStore(logger, true));

  describeAztecArray('Async AztecArray', () => Promise.resolve(openTmpStore(logger, true)), true);
});
