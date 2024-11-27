import { describeAztecSet } from '../interfaces/set_test_suite.js';
import { openTmpJungleStore } from '../utils.js';

describe('JungleDBSet', () => {
  describeAztecSet('AztecSet', async () => openTmpJungleStore(true));
});
