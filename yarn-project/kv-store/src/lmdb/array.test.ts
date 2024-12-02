import { describeAztecArray } from '../interfaces/array_test_suite.js';
import { openTmpStore } from './index.js';

describe('LMDBArray', () => {
  describeAztecArray('Sync AztecArray', () => openTmpStore(true));

  describeAztecArray('Async AztecArray', () => Promise.resolve(openTmpStore(true)), true);
});
