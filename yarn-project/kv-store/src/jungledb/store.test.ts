import { describeAztecStore } from '../interfaces/store_test_suite.js';
import { AztecJungleDBStore } from './store.js';

describe('AztecJungleDBStore', () => {
  describeAztecStore(
    'AztecStore',
    async path => AztecJungleDBStore.open(path, false),
    async () => AztecJungleDBStore.open(undefined, false),
    async () => AztecJungleDBStore.open(undefined, true),
  );
});
