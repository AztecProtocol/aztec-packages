import { describeAztecArray } from '../interfaces/array_test_suite.js';
import { openTmpJungleStore, openTmpStore } from '../utils.js';

describe('JungleDBArray', () => {
  describeAztecArray('AztecArray', async () => openTmpJungleStore(true));
});
