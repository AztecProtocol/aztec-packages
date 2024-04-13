import { addCounterTests } from '../tests/aztec_counter_tests.js';
import { MemAztecCounter } from './counter.js';
import { MemDb } from './mem_db.js';

describe('MemAztecCounter', () => {
  addCounterTests(() => new MemAztecCounter('test', new MemDb()));
});
