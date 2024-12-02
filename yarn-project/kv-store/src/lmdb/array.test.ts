import { describeAztecArray } from '../interfaces/array_test_suite.js';
import { openTmpStore } from './index.js';

describe('LMDBArray', () => {
  describeAztecArray('Sync AztecArray', async () => openTmpStore(true));

  describeAztecArray('Async AztecArray', async () => openTmpStore(true), true);
});
