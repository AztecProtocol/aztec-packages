import { createLogger } from '@aztec/foundation/log';

import { describeAztecSet } from '../interfaces/set_test_suite.js';
import { openTmpStore } from './index.js';

const logger = createLogger('kv-store:lmdb:test');

describe('LMDBSet', () => {
  describeAztecSet('Sync AztecSet', () => openTmpStore(logger, true));

  describeAztecSet('Aync AztecSet', () => Promise.resolve(openTmpStore(logger, true)), true);
});
