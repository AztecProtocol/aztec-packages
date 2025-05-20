import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';

import { LocalFileStore } from './local.js';

describe('LocalFileStore', () => {
  let fileStore: LocalFileStore;
  let testDir: string;

  afterAll(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Silently ignore
    }
  });

  describe('save', () => {
    let data: string;
    let filePath: string;
    let fileUrl: string;

    beforeAll(async () => {
      testDir = await mkdtemp((tmpdir(), 'local-file-store-1-'));
      fileStore = new LocalFileStore(testDir);

      data = 'foobar';
      filePath = 'test.txt';
      fileUrl = await fileStore.save(filePath, Buffer.from(data));
    });

    it('reads using full url', async () => {
      expect(await fileStore.read(fileUrl).then(x => x.toString())).toEqual(data);
    });

    it('reads using path', async () => {
      expect(await fileStore.read(filePath).then(x => x.toString())).toEqual(data);
    });

    it('checks file exists with full url', async () => {
      expect(await fileStore.exists(fileUrl)).toBe(true);
    });

    it('checks file exists with path', async () => {
      expect(await fileStore.exists(filePath)).toBe(true);
    });
  });
});
