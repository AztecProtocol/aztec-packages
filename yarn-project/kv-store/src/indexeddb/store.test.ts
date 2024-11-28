import { describeAztecStore } from '../interfaces/store_test_suite.js';
import { AztecIndexedDBStore } from './store.js';

describe('AztecIndexedDBStore', () => {
  describeAztecStore(
    'AztecStore',
    async path => AztecIndexedDBStore.open(path, false),
    async () => AztecIndexedDBStore.open(undefined, false),
    async () => AztecIndexedDBStore.open(undefined, true),
  );
});
