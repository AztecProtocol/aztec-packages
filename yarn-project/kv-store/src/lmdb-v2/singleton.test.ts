import { createLogger } from '@aztec/foundation/log';

import { describeAztecSingleton } from '../interfaces/singleton_test_suite.js';
import { openTmpStore } from './factory.js';

const logger = createLogger('kv-store:lmdb-v2:singleton:test');

describeAztecSingleton('LMDBSingleValue', () => openTmpStore('test', logger), true);
