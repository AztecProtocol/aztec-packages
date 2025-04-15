import { describeAztecMultiMap } from '../interfaces/multi_map_test_suite.js';
import { openTmpStore } from './factory.js';

describeAztecMultiMap('LMDBMultiMap', () => openTmpStore('test'), true);
