import { EthAddress } from '@aztec/circuits.js';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { readFile, writeFile } from 'fs/promises';

export class WorldStateVersion {
  constructor(readonly version: number, readonly rollupAddress: EthAddress) {}

  static async readVersion(filename: string) {
    const expectedLength = WorldStateVersion.empty().toBuffer().length;

    const versionData = await readFile(filename).catch(() => undefined);
    if (versionData === undefined || versionData.length != expectedLength) {
      return undefined;
    }
    return WorldStateVersion.fromBuffer(versionData);
  }

  public async writeVersionFile(filename: string) {
    await writeFile(filename, this.toBuffer());
  }

  toBuffer() {
    return serializeToBuffer([this.version, this.rollupAddress]);
  }

  static fromBuffer(buffer: Buffer | BufferReader): WorldStateVersion {
    const reader = BufferReader.asReader(buffer);
    return new WorldStateVersion(reader.readNumber(), reader.readObject(EthAddress));
  }

  static empty() {
    return new WorldStateVersion(0, EthAddress.ZERO);
  }
}
