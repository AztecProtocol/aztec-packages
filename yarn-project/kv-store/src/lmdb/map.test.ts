import { createLogger } from '@aztec/foundation/log';

import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { openTmpStore } from './index.js';

const logger = createLogger('kv-store:lmdb:test');

describe('LMDBMap', () => {
  describeAztecMap('Sync AztecMap', () => openTmpStore(logger, true));

  describeAztecMap('Async AztecMap', () => Promise.resolve(openTmpStore(logger, true)), true);
});
