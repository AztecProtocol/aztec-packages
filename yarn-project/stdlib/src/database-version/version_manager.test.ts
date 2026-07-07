import { BlockNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';

import { jest } from '@jest/globals';
import { join } from 'path';

import { DatabaseVersion } from './database_version.js';
import {
  DatabaseVersionManager,
  type DatabaseVersionManagerFs,
  type DatabaseVersionManagerOptions,
} from './version_manager.js';

describe('VersionManager', () => {
  let tempDir: string;
  let openSpy: jest.MockedFunction<(dataDir: string) => Promise<object>>;
  let upgradeSpy: jest.MockedFunction<(dataDir: string, ver1: number, ver2: number) => Promise<void>>;
  let fs: { [K in keyof DatabaseVersionManagerFs]: jest.MockedFunction<DatabaseVersionManagerFs[K]> };
  let fileHandle: { writeFile: jest.Mock; sync: jest.Mock; close: jest.Mock };
  let versionManager: DatabaseVersionManager<object>;
  let currentVersion: number;
  let rollupAddress: EthAddress;
  let expectVersionFileWritten: boolean;

  const createManager = (overrides: Partial<DatabaseVersionManagerOptions<object>> = {}) =>
    new DatabaseVersionManager({
      schemaVersion: currentVersion,
      rollupAddress,
      dataDirectory: tempDir,
      onOpen: openSpy,
      onUpgrade: upgradeSpy,
      fileSystem: fs,
      ...overrides,
    });

  beforeEach(() => {
    fileHandle = {
      writeFile: jest.fn<any>(),
      sync: jest.fn<any>(),
      close: jest.fn<any>(),
    };

    fs = {
      readFile: jest.fn<any>().mockRejectedValue(Object.assign(new Error('test error'), { code: 'ENOENT' })),
      mkdir: jest.fn<any>(),
      rm: jest.fn<any>(),
      rename: jest.fn<any>(),
      open: jest.fn<any>().mockResolvedValue(fileHandle),
    };

    tempDir = `/tmp/aztec-version-test`;

    currentVersion = 42;
    rollupAddress = EthAddress.random();
    expectVersionFileWritten = true;

    openSpy = jest.fn(() => Promise.resolve({}));
    upgradeSpy = jest.fn(() => Promise.resolve());
    versionManager = createManager();
  });

  describe('open', () => {
    afterEach(() => {
      if (!expectVersionFileWritten) {
        return;
      }
      const finalPath = join(tempDir, DatabaseVersionManager.VERSION_FILE);
      const tmpPath = `${finalPath}.tmp`;
      // The version marker is written atomically: a temp file is filled and fsync'd, then renamed into
      // place. It is never written directly to the final path.
      expect(fs.open).toHaveBeenCalledWith(tmpPath, 'w');
      expect(fileHandle.writeFile).toHaveBeenCalledWith(new DatabaseVersion(currentVersion, rollupAddress).toBuffer());
      expect(fileHandle.sync).toHaveBeenCalled();
      expect(fs.rename).toHaveBeenCalledWith(tmpPath, finalPath);
      expect(fs.open).not.toHaveBeenCalledWith(finalPath, 'w');
    });

    describe('resets the database', () => {
      it('when no version file exists', async () => {
        fs.readFile.mockRejectedValueOnce(Object.assign(new Error('Test: file not found'), { code: 'ENOENT' }));
        const [_, wasReset] = await versionManager.open();
        expect(wasReset).toEqual(true);
        expect(upgradeSpy).not.toHaveBeenCalled();
      });

      it("when there's an fs error", async () => {
        fs.readFile.mockRejectedValueOnce(Object.assign(new Error('Test: file not found'), { code: 'EACCESS' }));
        const [_, wasReset] = await versionManager.open();
        expect(wasReset).toEqual(true);
        expect(upgradeSpy).not.toHaveBeenCalled();
      });

      it.each(['', 'definitely not a json', JSON.stringify({ foo: 'bar' })])(
        'when the version file is malformed',
        async str => {
          fs.readFile.mockResolvedValueOnce(Buffer.from(str));
          const [_, wasReset] = await versionManager.open();
          expect(wasReset).toEqual(true);
          expect(upgradeSpy).not.toHaveBeenCalled();
        },
      );

      it('when there is no way to upgrade', async () => {
        fs.readFile.mockResolvedValueOnce(new DatabaseVersion(currentVersion - 1, rollupAddress).toBuffer());
        versionManager = createManager({ onUpgrade: undefined });
        const [_, wasReset] = await versionManager.open();
        expect(wasReset).toEqual(true);
      });

      it("when it's a downgrade", async () => {
        fs.readFile.mockResolvedValueOnce(new DatabaseVersion(currentVersion + 1, rollupAddress).toBuffer());
        const [_, wasReset] = await versionManager.open();
        expect(wasReset).toEqual(true);
        expect(upgradeSpy).not.toHaveBeenCalled();
      });

      it('unless schema mismatches are configured to throw', async () => {
        fs.readFile.mockResolvedValueOnce(new DatabaseVersion(currentVersion + 1, rollupAddress).toBuffer());
        versionManager = createManager({ schemaVersionMismatchPolicy: 'throw' });
        expectVersionFileWritten = false;

        await expect(versionManager.open()).rejects.toThrow(
          `stored schema version ${currentVersion + 1} is incompatible with expected schema version ${currentVersion}`,
        );
        expect(fs.rm).not.toHaveBeenCalled();
        expect(openSpy).not.toHaveBeenCalled();
      });

      it('when the upgrade fails', async () => {
        fs.readFile.mockResolvedValueOnce(new DatabaseVersion(currentVersion - 1, rollupAddress).toBuffer());
        upgradeSpy.mockRejectedValueOnce(new Error('Test: failed upgrade'));
        const [_, wasReset] = await versionManager.open();
        expect(wasReset).toEqual(true);
        expect(upgradeSpy).toHaveBeenCalledWith(tempDir, currentVersion - 1, currentVersion);
      });

      it('when the rollup address changes', async () => {
        fs.readFile.mockResolvedValueOnce(new DatabaseVersion(currentVersion, EthAddress.random()).toBuffer());
        const [_, wasReset] = await versionManager.open();
        expect(wasReset).toEqual(true);
        expect(upgradeSpy).not.toHaveBeenCalled();
      });
    });

    describe('version file read-failure policy', () => {
      it('defaults to resetting when the version file cannot be read (non-ENOENT)', async () => {
        fs.readFile.mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'EACCES' }));
        const [_, wasReset] = await versionManager.open();
        expect(wasReset).toEqual(true);
        expect(fs.rm).toHaveBeenCalled();
      });

      it("throws without resetting when policy is 'throw' and the read fails (non-ENOENT)", async () => {
        fs.readFile.mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'EACCES' }));
        versionManager = createManager({ versionFileReadFailurePolicy: 'throw' });
        expectVersionFileWritten = false;

        await expect(versionManager.open()).rejects.toThrow(/Refusing to open the database; data was NOT reset/);
        expect(fs.rm).not.toHaveBeenCalled();
        expect(openSpy).not.toHaveBeenCalled();
        expect(fs.rename).not.toHaveBeenCalled();
      });

      it("throws without resetting when policy is 'throw' and the version file is garbage", async () => {
        fs.readFile.mockResolvedValueOnce(Buffer.from('definitely not json'));
        versionManager = createManager({ versionFileReadFailurePolicy: 'throw' });
        expectVersionFileWritten = false;

        await expect(versionManager.open()).rejects.toThrow(/Refusing to open the database/);
        expect(fs.rm).not.toHaveBeenCalled();
        expect(openSpy).not.toHaveBeenCalled();
        expect(fs.rename).not.toHaveBeenCalled();
      });

      it("opens fresh on a missing file even when policy is 'throw' (legitimate first boot)", async () => {
        fs.readFile.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
        versionManager = createManager({ versionFileReadFailurePolicy: 'throw' });
        const [_, wasReset] = await versionManager.open();
        expect(wasReset).toEqual(true);
        expect(openSpy).toHaveBeenCalled();
      });
    });

    describe('durability of the version marker', () => {
      it('writes the version marker only after onOpen resolves', async () => {
        const calls: string[] = [];
        fs.readFile.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
        openSpy.mockImplementationOnce(() => {
          calls.push('onOpen');
          return Promise.resolve({});
        });
        fs.rename.mockImplementationOnce(() => {
          calls.push('rename');
          return Promise.resolve();
        });

        await versionManager.open();
        expect(calls).toEqual(['onOpen', 'rename']);
      });

      it('does not write a marker when onOpen fails, so a re-open resets instead of wedging', async () => {
        fs.readFile.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
        openSpy.mockRejectedValueOnce(new Error('open failed'));
        expectVersionFileWritten = false;

        await expect(versionManager.open()).rejects.toThrow('open failed');
        expect(fs.rename).not.toHaveBeenCalled();

        // A crash left no marker: the next start still sees ENOENT, resets, and opens cleanly.
        openSpy.mockResolvedValueOnce({});
        const [_, wasReset] = await versionManager.open();
        expect(wasReset).toEqual(true);
        expect(openSpy).toHaveBeenCalledTimes(2);
        expect(fs.rename).toHaveBeenCalled();
      });

      it('writes the marker via a temp file and rename, never directly to the final path', async () => {
        fs.readFile.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
        await versionManager.open();

        const finalPath = join(tempDir, DatabaseVersionManager.VERSION_FILE);
        expect(fs.open).toHaveBeenCalledWith(`${finalPath}.tmp`, 'w');
        expect(fileHandle.sync).toHaveBeenCalled();
        expect(fs.rename).toHaveBeenCalledWith(`${finalPath}.tmp`, finalPath);
        expect(fs.open).not.toHaveBeenCalledWith(finalPath, 'w');
      });

      it('closes the freshly opened database when writing the marker fails', async () => {
        fs.readFile.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
        const close = jest.fn<() => Promise<void>>().mockResolvedValue();
        openSpy.mockResolvedValueOnce({ close });
        // Fail the marker write at the temp-file open (e.g. ENOSPC) after the DB already opened.
        fs.open.mockRejectedValueOnce(new Error('ENOSPC'));
        expectVersionFileWritten = false;

        await expect(versionManager.open()).rejects.toThrow('ENOSPC');
        expect(close).toHaveBeenCalled();
      });
    });

    it('upgrades the db', async () => {
      const upgradedDb = { currentVersion, upgraded: true };
      openSpy.mockResolvedValueOnce(upgradedDb);
      fs.readFile.mockResolvedValueOnce(new DatabaseVersion(currentVersion - 1, rollupAddress).toBuffer());

      const [db, wasReset] = await versionManager.open();
      expect(db).toBe(upgradedDb);
      expect(upgradeSpy).toHaveBeenCalledWith(tempDir, currentVersion - 1, currentVersion);
      expect(wasReset).toBe(false);
    });

    it('opens the db without rewriting the marker when the version already matches', async () => {
      fs.readFile.mockResolvedValueOnce(new DatabaseVersion(currentVersion, rollupAddress).toBuffer());
      const expectedDb = { version: currentVersion };
      openSpy.mockResolvedValueOnce(expectedDb);
      expectVersionFileWritten = false;

      const [db, wasReset] = await versionManager.open();
      expect(db).toBe(expectedDb);
      expect(wasReset).toBe(false);
      expect(upgradeSpy).not.toHaveBeenCalled();
      // The marker already matches on disk, so it is not rewritten: no temp file, no fsync, no rename.
      expect(fs.open).not.toHaveBeenCalled();
      expect(fs.rename).not.toHaveBeenCalled();
    });
  });
});

describe('Version', () => {
  it('should create an empty version', () => {
    const emptyVersion = DatabaseVersion.empty();
    expect(emptyVersion.schemaVersion).toBe(0);
    expect(emptyVersion.rollupAddress.equals(EthAddress.ZERO)).toBe(true);
  });

  it('should serialize correctly', () => {
    const ver = new DatabaseVersion(42, EthAddress.random());
    expect(DatabaseVersion.fromBuffer(ver.toBuffer())).toEqual(ver);
  });

  it('establishes a partial ordering', () => {
    const verA = new DatabaseVersion(42, EthAddress.random());
    const verB = new DatabaseVersion(43, verA.rollupAddress);
    const verC = new DatabaseVersion(42, EthAddress.random());

    expect(verA.cmp(verB)).toEqual(-1);
    expect(verB.cmp(verA)).toEqual(BlockNumber(1));
    expect(verA.cmp(new DatabaseVersion(verA.schemaVersion, verA.rollupAddress))).toEqual(0);
    expect(verA.cmp(verC)).toEqual(undefined);
  });
});
