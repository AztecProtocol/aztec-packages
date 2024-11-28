import { type Logger } from '@aztec/foundation/log';

import { describe } from 'mocha';

import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { AztecIndexedDBStore } from './store.js';

const mockLogger: Logger = {
  debug: (msg, data) => console.log(msg, data),
  info: (msg, data) => console.log(msg, data),
  warn: (msg, data) => console.log(msg, data),
  error: (msg, data) => console.error(msg, data),
  silent: (msg, data) => console.log(msg, data),
  verbose: (msg, data) => console.log(msg, data),
};

describe('IndexedDBMap', () => {
  describeAztecMap('AztecMap', async () => AztecIndexedDBStore.open('test', mockLogger, true));
});
