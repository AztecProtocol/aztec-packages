import { createLogger } from '@aztec/foundation/log';

import { describeAztecMultiMap } from '../interfaces/multi_map_test_suite.js';
import { openTmpStore } from './index.js';

const logger = createLogger('kv-store:lmdb:test');

describe('LMDBMultiMap', () => {
  describeAztecMultiMap('Sync AztecMultiMap', () => openTmpStore(logger, true));

  describeAztecMultiMap('Async AztecMultiMap', () => Promise.resolve(openTmpStore(logger, true)), true);
});
