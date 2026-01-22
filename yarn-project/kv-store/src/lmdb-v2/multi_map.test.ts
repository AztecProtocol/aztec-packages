import { createLogger } from '@aztec/foundation/log';

import { describeAztecMultiMap } from '../interfaces/multi_map_test_suite.js';
import { openTmpStore } from './factory.js';

const logger = createLogger('kv-store:lmdb-v2:multi-map:test');

describeAztecMultiMap('LMDBMultiMap', () => openTmpStore('test', logger), true);
