import { describeAztecSet } from '../interfaces/set_test_suite.js';
import { openTmpStore } from './index.js';

describe('LMDBSet', () => {
  describeAztecSet('Sync AztecSet', () => openTmpStore(true));

  describeAztecSet('Aync AztecSet', () => Promise.resolve(openTmpStore(true)), true);
});
