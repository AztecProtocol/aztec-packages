import { describeAztecSet } from '../interfaces/set_test_suite.js';
import { openTmpStore } from '../utils.js';

describe('LMDBSet', () => {
  describeAztecSet('AztecSet', async () => openTmpStore(true));
});
