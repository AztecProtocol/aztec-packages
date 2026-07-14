import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';

import fs from 'fs/promises';
import { join } from 'path';

import { DatabaseVersion } from './database_version.js';

export type DatabaseVersionManagerFs = Pick<typeof fs, 'readFile' | 'rm' | 'mkdir' | 'rename' | 'open'>;

export const DATABASE_VERSION_FILE_NAME = 'db_version';
export type SchemaVersionMismatchPolicy = 'reset' | 'throw';

/**
 * How to react when the version file exists but cannot be read (permissions, IO error, truncation).
 * `'reset'` (default) treats the store as unversioned and lets the reset path run — safe for stores
 * where an empty state is legitimate. `'throw'` refuses to open, leaving data untouched — required
 * for protection stores (e.g. signing protection) that must never be silently wiped by a transient
 * filesystem error. A genuinely missing file (ENOENT) is a first boot and is never affected by this.
 */
export type VersionFileReadFailurePolicy = 'reset' | 'throw';

export type DatabaseVersionManagerOptions<T> = {
  schemaVersion: number;
  rollupAddress: EthAddress;
  dataDirectory: string;
  onOpen: (dataDir: string) => Promise<T>;
  onUpgrade?: (dataDir: string, currentVersion: number, latestVersion: number) => Promise<void>;
  schemaVersionMismatchPolicy?: SchemaVersionMismatchPolicy;
  versionFileReadFailurePolicy?: VersionFileReadFailurePolicy;
  fileSystem?: DatabaseVersionManagerFs;
  log?: Logger;
};

/**
 * A manager for handling database versioning and migrations.
 * This class will check the version of data in a directory and either
 * reset or upgrade based on version compatibility.
 */
export class DatabaseVersionManager<T> {
  public static readonly VERSION_FILE = DATABASE_VERSION_FILE_NAME;

  private readonly versionFile: string;
  private readonly currentVersion: DatabaseVersion;

  private dataDirectory: string;
  private onOpen: (dataDir: string) => Promise<T>;
  private onUpgrade?: (dataDir: string, currentVersion: number, latestVersion: number) => Promise<void>;
  private schemaVersionMismatchPolicy: SchemaVersionMismatchPolicy;
  private versionFileReadFailurePolicy: VersionFileReadFailurePolicy;
  private fileSystem: DatabaseVersionManagerFs;
  private log: Logger;

  /**
   * Create a new version manager
   *
   * @param schemaVersion - The current version of the application
   * @param rollupAddress - The rollup contract address
   * @param dataDirectory - The directory where version information will be stored
   * @param onOpen - A callback to the open the database at the given location
   * @param onUpgrade - An optional callback to upgrade the database before opening. If not provided it will reset the
   *   database. Must be idempotent: since the version marker is written only after a successful open, a crash after
   *   onUpgrade but before the marker is written re-runs onUpgrade on the next start.
   * @param schemaVersionMismatchPolicy - Whether schema mismatches should reset data or throw
   * @param versionFileReadFailurePolicy - Whether an unreadable (non-missing) version file should reset data or throw
   * @param fileSystem - An interface to access the filesystem
   * @param log - Optional custom logger
   * @param options - Configuration options
   */
  constructor({
    schemaVersion,
    rollupAddress,
    dataDirectory,
    onOpen,
    onUpgrade,
    schemaVersionMismatchPolicy = 'reset',
    versionFileReadFailurePolicy = 'reset',
    fileSystem = fs,
    log = createLogger(`foundation:version-manager`),
  }: DatabaseVersionManagerOptions<T>) {
    if (schemaVersion < 1) {
      throw new TypeError(`Invalid schema version received: ${schemaVersion}`);
    }

    this.versionFile = join(dataDirectory, DatabaseVersionManager.VERSION_FILE);
    this.currentVersion = new DatabaseVersion(schemaVersion, rollupAddress);

    this.dataDirectory = dataDirectory;
    this.onOpen = onOpen;
    this.onUpgrade = onUpgrade;
    this.schemaVersionMismatchPolicy = schemaVersionMismatchPolicy;
    this.versionFileReadFailurePolicy = versionFileReadFailurePolicy;
    this.fileSystem = fileSystem;
    this.log = log;
  }

  static async writeVersion(version: DatabaseVersion, dataDir: string, fileSystem: DatabaseVersionManagerFs = fs) {
    await fileSystem.mkdir(dataDir, { recursive: true });
    const finalPath = join(dataDir, DatabaseVersionManager.VERSION_FILE);
    const tmpPath = `${finalPath}.tmp`;

    // Atomic durable write: fill a temp file, fsync it, then rename it into place. The marker only
    // becomes visible under its final name once its bytes are durably on disk, so a crash mid-write
    // can never leave a "valid" version file sitting over an empty or partially-populated data dir.
    const handle = await fileSystem.open(tmpPath, 'w');
    try {
      await handle.writeFile(version.toBuffer());
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fileSystem.rename(tmpPath, finalPath);

    // Best-effort fsync of the containing directory so the rename itself survives a crash. Not all
    // filesystems support directory fsync, so a failure here is non-fatal.
    try {
      const dirHandle = await fileSystem.open(dataDir, 'r');
      try {
        await dirHandle.sync();
      } finally {
        await dirHandle.close();
      }
    } catch {
      // directory fsync is best-effort
    }
  }

  /**
   * Checks the stored version against the current version and handles the outcome
   * by either resetting the data directory or calling an upgrade function
   *
   * @param onReset - Function to call when a full reset is needed
   * @param onUpgrade - Function to call when an upgrade is needed
   * @returns True if data was reset, false if upgraded or no change needed
   */
  public async open(): Promise<[T, boolean]> {
    // const storedVersion = await DatabaseVersion.readVersion(this.versionFile);
    let storedVersion: DatabaseVersion;
    // a flag to suppress logs about 'resetting the data dir' when starting from an empty state
    let shouldLogDataReset = true;

    try {
      const versionBuf = await this.fileSystem.readFile(this.versionFile);
      storedVersion = DatabaseVersion.fromBuffer(versionBuf);
    } catch (err) {
      if (err && (err as Error & { code: string }).code === 'ENOENT') {
        storedVersion = DatabaseVersion.empty();
        // only turn off these logs if the data dir didn't exist before
        shouldLogDataReset = false;
      } else if (this.versionFileReadFailurePolicy === 'throw') {
        // The version file exists but could not be read/parsed (permissions, IO error, truncation).
        // Treating this as "unversioned" would reset the data directory, silently wiping a store that
        // must fail closed. Refuse to open instead, leaving the data untouched for the operator.
        const code = (err as Error & { code?: string })?.code;
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to read database version file at ${this.versionFile} (${code ?? 'unknown error'}: ${message}). ` +
            `Refusing to open the database; data was NOT reset. Resolve the underlying filesystem error and retry.`,
          { cause: err },
        );
      } else {
        this.log.warn(`Failed to read stored version information: ${err}. Defaulting to empty version`);
        storedVersion = DatabaseVersion.empty();
      }
    }

    const cmp = storedVersion.cmp(this.currentVersion);
    let needsReset = false;

    if (typeof cmp === 'number') {
      // only allow forward upgrades
      if (cmp === -1 && this.onUpgrade) {
        this.log.info(`Upgrading from version ${storedVersion.schemaVersion} to ${this.currentVersion.schemaVersion}`);
        try {
          await this.onUpgrade(this.dataDirectory, storedVersion.schemaVersion, this.currentVersion.schemaVersion);
        } catch (error) {
          if (this.schemaVersionMismatchPolicy === 'throw') {
            throw new Error(
              `Failed to upgrade database at ${this.dataDirectory} from schema version ${storedVersion.schemaVersion} to ${this.currentVersion.schemaVersion}`,
              { cause: error },
            );
          }
          this.log.error(`Failed to upgrade: ${error}. Falling back to reset.`);
          needsReset = true;
        }
      } else if (cmp !== 0) {
        if (this.schemaVersionMismatchPolicy === 'throw') {
          throw new Error(
            `Cannot open database at ${this.dataDirectory}: stored schema version ${storedVersion.schemaVersion} is incompatible with expected schema version ${this.currentVersion.schemaVersion}`,
          );
        }
        if (shouldLogDataReset) {
          this.log.info(
            `Can't upgrade from version ${storedVersion} to ${this.currentVersion}. Resetting database at ${this.dataDirectory}`,
          );
        }
        needsReset = true;
      }
    } else {
      if (shouldLogDataReset) {
        this.log.warn('Rollup address has changed, resetting data directory', {
          versionFile: this.versionFile,
          storedVersion,
          currentVersion: this.currentVersion,
        });
      }
      needsReset = true;
    }

    // Handle reset if needed
    if (needsReset) {
      await this.resetDataDirectory();
    }

    // Open the database first, then record the version marker. Writing the marker only after a
    // successful open makes it a post-commit record: if the process crashes between the reset and a
    // durable open, no marker is left behind, so the next startup re-runs the reset instead of
    // trusting a marker that sits over empty or partially-initialized data.
    const instance = await this.onOpen(this.dataDirectory);

    // Only (re)write the marker when it would actually change — first boot, reset, or upgrade. On a
    // normal boot it already matches, so skipping avoids an unnecessary fsync (and the directory
    // write permission the temp-file+rename needs) and, more importantly, any window where a
    // marker-write failure would orphan the database we just opened.
    if (!storedVersion.equals(this.currentVersion)) {
      try {
        await this.writeVersion();
      } catch (err) {
        // The database opened but recording the marker failed; close the freshly opened instance so
        // we do not leak its file handles / locks before propagating the failure.
        await this.closeQuietly(instance);
        throw err;
      }
    }

    return [instance, needsReset];
  }

  /**
   * Best-effort close of a just-opened database instance, used to avoid leaking handles/locks when a
   * post-open step fails. Swallows close errors so the original failure is the one that propagates.
   */
  private async closeQuietly(instance: T): Promise<void> {
    const closable = instance as
      | { close?: () => Promise<void> | void; [Symbol.asyncDispose]?: () => Promise<void> }
      | undefined;
    const dispose = closable?.close ?? closable?.[Symbol.asyncDispose];
    if (typeof dispose !== 'function') {
      return;
    }
    try {
      await dispose.call(closable);
    } catch (err) {
      this.log.warn(`Failed to close database after version-write failure: ${err}`);
    }
  }

  /**
   * Writes the current version to the version file
   */
  public writeVersion(dir?: string): Promise<void> {
    return DatabaseVersionManager.writeVersion(this.currentVersion, dir ?? this.dataDirectory, this.fileSystem);
  }

  /**
   * Resets the data directory by deleting it and recreating it
   */
  public async resetDataDirectory(): Promise<void> {
    try {
      await this.fileSystem.rm(this.dataDirectory, { recursive: true, force: true, maxRetries: 3 });
      await this.fileSystem.mkdir(this.dataDirectory, { recursive: true });
    } catch (err) {
      this.log.error(`Failed to reset data directory: ${err}`);
      throw new Error(`Failed to reset data directory: ${err}`, { cause: err });
    }
  }

  /**
   * Get the data directory path
   */
  public getDataDirectory(): string {
    return this.dataDirectory;
  }

  /**
   * Get the current version number
   */
  public getSchemaVersion(): number {
    return this.currentVersion.schemaVersion;
  }
}
