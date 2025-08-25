import { describeAztecSet } from '../interfaces/set_test_suite.js';
import { openTmpStore } from './index.js';

describeAztecSet('LMDBSet', () => openTmpStore('test'), true);
