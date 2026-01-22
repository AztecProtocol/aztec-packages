import { createLogger } from '@aztec/foundation/log';

import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { openTmpStore } from './index.js';

const logger = createLogger('kv-store:lmdb-v2:map:test');

describeAztecMap('LMDBMap', () => openTmpStore('test', logger), true);
