import { EthAddress } from '@aztec/foundation/eth-address';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';

import { z } from 'zod';

/**
 * Symbol for Node.js custom inspect. Using Symbol.for() is the documented way to
 * reference this without importing node:util. In browsers, objects with this symbol
 * simply won't have custom inspect behavior (which is fine).
 * @see https://nodejs.org/api/util.html#utilinspectcustom
 */
const inspectCustomSymbol = Symbol.for('nodejs.util.inspect.custom');

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
      return jsonParseWithSchema(buf.toString('utf-8'), DatabaseVersion.schema);
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

  /** Allows for better introspection in Node.js console. Ignored in browser envs. */
  public [inspectCustomSymbol](): string {
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
