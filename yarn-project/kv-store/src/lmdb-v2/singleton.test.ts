import { describeAztecSingleton } from '../interfaces/singleton_test_suite.js';
import { openTmpStore } from './factory.js';

describeAztecSingleton('LMDBSingleValue', () => openTmpStore('test'), true);
