import { addMapTests } from '../tests/aztec_map_tests.js';
import { MemAztecMap } from './map.js';
import { MemDb } from './mem_db.js';

describe('MemAztecMap', () => {
  addMapTests(() => new MemAztecMap('test', new MemDb()));
});
