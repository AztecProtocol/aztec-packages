import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { AztecLMDBStoreV2 } from './store.js';

describeAztecMap('LMDBMap', () => AztecLMDBStoreV2.tmp(), true);
