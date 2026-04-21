import { describeAztecSet } from '../interfaces/set_test_suite.js';
import { mockLogger } from '../interfaces/utils.js';
import { AesGcmCipher, RawKeyProvider } from './cipher.js';
import { AztecSQLiteOPFSStore } from './store.js';

describe('SQLiteOPFSSet', () => {
  describeAztecSet('AztecSet', async () => await AztecSQLiteOPFSStore.open(mockLogger, undefined, true));
});

describe('SQLiteOPFSSet (encrypted)', () => {
  describeAztecSet('AztecSet', async () => {
    const cipher = await AesGcmCipher.create(new RawKeyProvider(globalThis.crypto.getRandomValues(new Uint8Array(32))));
    return await AztecSQLiteOPFSStore.open(mockLogger, undefined, true, undefined, cipher);
  });
});
