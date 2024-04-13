import { addArrayTests } from '../tests/aztec_array_tests.js';
import { MemAztecArray } from './array.js';
import { MemDb } from './mem_db.js';

describe('MemAztecArray', () => {
  addArrayTests(() => new MemAztecArray('test', new MemDb()));
});
