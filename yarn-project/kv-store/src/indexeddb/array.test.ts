import { describeAztecArray } from '../interfaces/array_test_suite.js';
import { openTmpStore } from './index.js';

describe('IndexedDBArray', () => {
  describeAztecArray('AztecArray', async () => openTmpStore(true));
});
