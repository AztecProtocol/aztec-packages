import { describeAztecArray } from '../interfaces/array_test_suite.js';
import { openTmpStore } from './factory.js';

describeAztecArray('LMDBArrayV2', () => openTmpStore('test'), true);
