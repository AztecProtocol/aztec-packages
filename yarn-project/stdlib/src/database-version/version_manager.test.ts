import { EthAddress } from '@aztec/foundation/eth-address';

import { jest } from '@jest/globals';
import { join } from 'path';

import { DatabaseVersion, DatabaseVersionManager, type DatabaseVersionManagerFs } from './version_manager.js';

describe('VersionManager', () => {
  let tempDir: string;
  let openSpy: jest.MockedFunction<(dataDir: string) => Promise<object>>;
  let upgradeSpy: jest.MockedFunction<(dataDir: string, ver1: number, ver2: number) => Promise<void>>;
  let fs: { [K in keyof DatabaseVersionManagerFs]: jest.MockedFunction<DatabaseVersionManagerFs[K]> };
  let versionManager: DatabaseVersionManager<object>;
  let currentVersion: number;
  let rollupAddress: EthAddress;

  beforeEach(() => {
    fs = {
      writeFile: jest.fn<any>(),
      readFile: jest.fn<any>().mockRejectedValue(Object.assign(new Error('test error'), { code: 'ENOENT' })),
      mkdir: jest.fn<any>(),
      rm: jest.fn<any>(),
    };

    tempDir = `/tmp/aztec-version-test`;

    currentVersion = 42;
    rollupAddress = EthAddress.random();

    openSpy = jest.fn(() => Promise.resolve({}));
    upgradeSpy = jest.fn(() => Promise.resolve());
    versionManager = new DatabaseVersionManager({
      schemaVersion: currentVersion,
      rollupAddress,
      dataDirectory: tempDir,
      onOpen: openSpy,
      onUpgrade: upgradeSpy,
      fileSystem: fs,
    });
  });

  describe('open', () => {
    afterEach(() => {
      // Verify version file was created
      expect(fs.writeFile).toHaveBeenCalledWith(
        join(tempDir, DatabaseVersionManager.VERSION_FILE),
        new DatabaseVersion(currentVersion, rollupAddress).toBuffer(),
      );
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
        versionManager = new DatabaseVersionManager({
          schemaVersion: currentVersion,
          rollupAddress,
          dataDirectory: tempDir,
          onOpen: openSpy,
          onUpgrade: undefined,
          fileSystem: fs,
        });
        const [_, wasReset] = await versionManager.open();
        expect(wasReset).toEqual(true);
      });

      it("when it's a downgrade", async () => {
        fs.readFile.mockResolvedValueOnce(new DatabaseVersion(currentVersion + 1, rollupAddress).toBuffer());
        const [_, wasReset] = await versionManager.open();
        expect(wasReset).toEqual(true);
        expect(upgradeSpy).not.toHaveBeenCalled();
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

    it('upgrades the db', async () => {
      const upgradedDb = { currentVersion, upgraded: true };
      openSpy.mockResolvedValueOnce(upgradedDb);
      fs.readFile.mockResolvedValueOnce(new DatabaseVersion(currentVersion - 1, rollupAddress).toBuffer());

      const [db, wasReset] = await versionManager.open();
      expect(db).toBe(upgradedDb);
      expect(upgradeSpy).toHaveBeenCalledWith(tempDir, currentVersion - 1, currentVersion);
      expect(wasReset).toBe(false);
    });

    it('opens the db', async () => {
      fs.readFile.mockResolvedValueOnce(new DatabaseVersion(currentVersion, rollupAddress).toBuffer());
      const expectedDb = { version: currentVersion };
      openSpy.mockResolvedValueOnce(expectedDb);

      const [db, wasReset] = await versionManager.open();
      expect(db).toBe(expectedDb);
      expect(wasReset).toBe(false);
      expect(upgradeSpy).not.toHaveBeenCalled();
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

  it('establishes a partial odering', () => {
    const verA = new DatabaseVersion(42, EthAddress.random());
    const verB = new DatabaseVersion(43, verA.rollupAddress);
    const verC = new DatabaseVersion(42, EthAddress.random());

    expect(verA.cmp(verB)).toEqual(-1);
    expect(verB.cmp(verA)).toEqual(1);
    expect(verA.cmp(new DatabaseVersion(verA.schemaVersion, verA.rollupAddress))).toEqual(0);
    expect(verA.cmp(verC)).toEqual(undefined);
  });
});
