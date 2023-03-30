import { Database } from '../database/database.js';
import { MemoryDB } from '../database/memory_db.js';

describe('Synchroniser', () => {
  let database: Database;

  beforeAll(() => {
    database = new MemoryDB();
  });

  it('Synchroniser synchronises', async () => {});
});
