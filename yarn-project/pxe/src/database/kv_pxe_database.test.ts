import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { describePxeDatabase } from './interfaces/pxe_database_test_suite.js';
import { KVPxeDatabase } from './kv_pxe_database.js';

describe('KVPxeDatabase', () => {
  let database: KVPxeDatabase;

  beforeEach(async () => {
    database = await KVPxeDatabase.create(await openTmpStore('test'));
  });

  describePxeDatabase(() => database);
});
