import { VK_TREE_HEIGHT } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex } from '@aztec/foundation/string';

import type { UInt32 } from '../types/shared.js';
import { VerificationKeyData } from './verification_key.js';

export class VkData {
  constructor(
    public vk: VerificationKeyData,
    /**
     * Index of the vk in the vk tree.
     */
    public leafIndex: UInt32,
    /**
     * Sibling path of the vk in the vk tree.
     */
    public siblingPath: Tuple<Fr, typeof VK_TREE_HEIGHT>,
  ) {}

  static empty() {
    return new VkData(VerificationKeyData.empty(), 0, makeTuple(VK_TREE_HEIGHT, Fr.zero));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new VkData(
      reader.readObject(VerificationKeyData),
      reader.readNumber(),
      reader.readArray(VK_TREE_HEIGHT, Fr),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.vk, this.leafIndex, this.siblingPath);
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }
}
