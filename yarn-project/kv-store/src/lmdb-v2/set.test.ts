import { createLogger } from '@aztec/foundation/log';

import { describeAztecSet } from '../interfaces/set_test_suite.js';
import { openTmpStore } from './index.js';

const logger = createLogger('kv-store:lmdb-v2:set:test');

describeAztecSet('LMDBSet', () => openTmpStore('test', logger), true);
