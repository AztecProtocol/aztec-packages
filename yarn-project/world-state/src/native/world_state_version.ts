import { EthAddress } from '@aztec/circuits.js';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';

import { readFile, writeFile } from 'fs/promises';
import { z } from 'zod';

export class WorldStateVersion {
  constructor(public readonly version: number, public readonly rollupAddress: EthAddress) {}

  static async readVersion(filename: string) {
    const versionData = await readFile(filename, 'utf-8').catch(() => undefined);
    return versionData === undefined ? undefined : jsonParseWithSchema(versionData, WorldStateVersion.schema);
  }

  public async writeVersionFile(filename: string) {
    const data = jsonStringify(this);
    await writeFile(filename, data, 'utf-8');
  }

  static get schema() {
    return z
      .object({
        version: z.number(),
        rollupAddress: EthAddress.schema,
      })
      .transform(({ version, rollupAddress }) => new WorldStateVersion(version, rollupAddress));
  }

  static empty() {
    return new WorldStateVersion(0, EthAddress.ZERO);
  }
}
