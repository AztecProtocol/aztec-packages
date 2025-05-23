import { EthAddress } from '@aztec/foundation/eth-address';
import { jsonParseWithSchemaSync, jsonStringify } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';

import fs from 'fs/promises';
import { inspect } from 'node:util';
import { join } from 'path';
import { z } from 'zod';

/**
 * Represents a version record for storing in a version file.
 */
export class DatabaseVersion {
  constructor(
    /** The version of the data on disk. Used to perform upgrades */
    public readonly schemaVersion: number,
    /** The rollup the data pertains to */
    public readonly rollupAddress: EthAddress,
  ) {}

  public toBuffer(): Buffer {
    return Buffer.from(jsonStringify(this));
  }

  public static fromBuffer(buf: Buffer): DatabaseVersion {
    try {
      return jsonParseWithSchemaSync(buf.toString('utf-8'), DatabaseVersion.schema);
    } catch (err) {
      throw new Error(`Failed to deserialize version information: ${err}`, { cause: err });
    }
  }

  /**
   * Compares two versions. If the rollups addresses are different then it returns undefined
   */
  public cmp(other: DatabaseVersion): undefined | -1 | 0 | 1 {
    if (this.rollupAddress.equals(other.rollupAddress)) {
      if (this.schemaVersion < other.schemaVersion) {
        return -1;
      } else if (this.schemaVersion > other.schemaVersion) {
        return 1;
      } else {
        return 0;
      }
    }
    return undefined;
  }

  /**
   * Checks if two versions exactly match
   */
  public equals(other: DatabaseVersion): boolean {
    return this.cmp(other) === 0;
  }

  /**
   * Returns the schema for this class
   */
  static get schema() {
    return z
      .object({
        schemaVersion: z.number(),
        rollupAddress: EthAddress.schema,
      })
      .transform(({ schemaVersion, rollupAddress }) => new DatabaseVersion(schemaVersion, rollupAddress));
  }

  /** Allows for better introspection. */
  public [inspect.custom](): string {
    return this.toString();
  }

  public toString(): string {
    return `DatabaseVersion{schemaVersion=${this.schemaVersion},rollupAddress=${this.rollupAddress}"}`;
  }

  /**
   * Returns an empty instance
   */
  static empty() {
    return new DatabaseVersion(0, EthAddress.ZERO);
  }
}

export type DatabaseVersionManagerFs = Pick<typeof fs, 'readFile' | 'writeFile' | 'rm' | 'mkdir'>;

export const DATABASE_VERSION_FILE_NAME = 'db_version';

export type DatabaseVersionManagerOptions<T> = {
  schemaVersion: number;
  rollupAddress: EthAddress;
  dataDirectory: string;
  onOpen: (dataDir: string) => Promise<T>;
  onUpgrade?: (dataDir: string, currentVersion: number, latestVersion: number) => Promise<void>;
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
  private fileSystem: DatabaseVersionManagerFs;
  private log: Logger;

  /**
   * Create a new version manager
   *
   * @param schemaVersion - The current version of the application
   * @param rollupAddress - The rollup contract address
   * @param dataDirectory - The directory where version information will be stored
   * @param onOpen - A callback to the open the database at the given location
   * @param onUpgrade - An optional callback to upgrade the database before opening. If not provided it will reset the database
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
    this.fileSystem = fileSystem;
    this.log = log;
  }

  static async writeVersion(version: DatabaseVersion, dataDir: string, fileSystem: DatabaseVersionManagerFs = fs) {
    await fileSystem.mkdir(dataDir, { recursive: true });
    return fileSystem.writeFile(join(dataDir, DatabaseVersionManager.VERSION_FILE), version.toBuffer());
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
          this.log.error(`Failed to upgrade: ${error}. Falling back to reset.`);
          needsReset = true;
        }
      } else if (cmp !== 0) {
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

    // Write the current version to disk
    await this.writeVersion();

    return [await this.onOpen(this.dataDirectory), needsReset];
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
