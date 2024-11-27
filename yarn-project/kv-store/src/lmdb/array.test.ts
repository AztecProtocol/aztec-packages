import { describeAztecArray } from '../interfaces/array_test_suite.js';
import { openTmpStore } from '../utils.js';

describe('LMDBArray', () => {
  describeAztecArray('AztecArray', async () => openTmpStore(true));
});
