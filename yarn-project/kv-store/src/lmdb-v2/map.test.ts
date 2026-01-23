import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { openTmpStore } from './index.js';

describeAztecMap('LMDBMap', () => openTmpStore('test'), true);
