import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { openTmpStore } from './factory.js';

describeAztecMap('LMDBMap', () => openTmpStore('test'), true);
