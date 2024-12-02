import { describeAztecSet } from '../interfaces/set_test_suite.js';
import { openTmpStore } from './index.js';

describe('LMDBSet', () => {
  describeAztecSet('Sync AztecSet', async () => openTmpStore(true));

  describeAztecSet('Aync AztecSet', async () => openTmpStore(true), true);
});
