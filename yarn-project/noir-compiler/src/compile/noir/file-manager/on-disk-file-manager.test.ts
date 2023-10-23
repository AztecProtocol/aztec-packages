import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { fileManagerTestSuite } from './file-manager-test-suite.js';
import { OnDiskFileManager } from './on-disk-file-manager.js';

describe('OnDiskFileManager', () => {
  fileManagerTestSuite(
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'noir-compiler-test'));
      return new OnDiskFileManager(dir);
    },
    async fm => {
      await rm(fm.dataDir, {
        recursive: true,
      });
    },
  );
});
