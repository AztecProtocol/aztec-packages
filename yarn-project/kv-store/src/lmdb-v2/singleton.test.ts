import { describeAztecSingleton } from '../interfaces/singleton_test_suite.js';
import { AztecLMDBStoreV2 } from './store.js';

describeAztecSingleton('LMDBSingleValue', () => AztecLMDBStoreV2.tmp(), true);
