import { EthAddress } from '@aztec/circuits.js';

import { readFile, writeFile } from 'fs/promises';

export class WorldStateVersion {
  constructor(readonly version: number, readonly rollupAddress: EthAddress) {}

  static async readVersion(filename: string) {
    const versionData = await readFile(filename, 'utf-8').catch(() => undefined);
    if (versionData === undefined) {
      return undefined;
    }
    const versionJSON = JSON.parse(versionData);
    if (versionJSON.version === undefined || versionJSON.rollupAddress === undefined) {
      return undefined;
    }
    return WorldStateVersion.fromJSON(versionJSON);
  }

  public async writeVersionFile(filename: string) {
    const data = JSON.stringify(this.toJSON());
    await writeFile(filename, data, 'utf-8');
  }

  toJSON() {
    return {
      version: this.version,
      rollupAddress: this.rollupAddress.toChecksumString(),
    };
  }

  static fromJSON(obj: any): WorldStateVersion {
    const version = obj.version;
    const rollupAddress = EthAddress.fromString(obj.rollupAddress);
    return new WorldStateVersion(version, rollupAddress);
  }

  static empty() {
    return new WorldStateVersion(0, EthAddress.ZERO);
  }
}
