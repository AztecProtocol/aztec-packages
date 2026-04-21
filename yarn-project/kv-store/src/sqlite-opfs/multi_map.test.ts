import { describeAztecMultiMap } from '../interfaces/multi_map_test_suite.js';
import { mockLogger } from '../interfaces/utils.js';
import { AesGcmCipher, RawKeyProvider } from './cipher.js';
import { AztecSQLiteOPFSStore } from './store.js';

describe('SQLiteOPFSMultiMap', () => {
  describeAztecMultiMap('AztecMultiMap', async () => await AztecSQLiteOPFSStore.open(mockLogger, undefined, true));
});

describe('SQLiteOPFSMultiMap (encrypted)', () => {
  describeAztecMultiMap('AztecMultiMap', async () => {
    const cipher = await AesGcmCipher.create(new RawKeyProvider(globalThis.crypto.getRandomValues(new Uint8Array(32))));
    return await AztecSQLiteOPFSStore.open(mockLogger, undefined, true, undefined, cipher);
  });
});
