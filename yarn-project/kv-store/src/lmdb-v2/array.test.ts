import { createLogger } from '@aztec/foundation/log';

import { describeAztecArray } from '../interfaces/array_test_suite.js';
import { openTmpStore } from './factory.js';

const logger = createLogger('kv-store:lmdb-v2:array:test');

describeAztecArray('LMDBArrayV2', () => openTmpStore('test', logger), true);
