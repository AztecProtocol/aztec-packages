import { addSingletonTests } from '../tests/aztec_singleton_tests.js';
import { MemDb } from './mem_db.js';
import { MemAztecSingleton } from './singleton.js';

describe('MemAztecSingleton', () => {
  addSingletonTests(() => new MemAztecSingleton('test', new MemDb()));
});
