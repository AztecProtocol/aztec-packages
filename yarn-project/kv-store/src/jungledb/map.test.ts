import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { openTmpJungleStore } from '../utils.js';

describe('JungleDBMap', () => {
  describeAztecMap('AztecMap', async () => openTmpJungleStore(true));
});
