import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex } from '@aztec/foundation/string';

import { VK_TREE_HEIGHT } from '../constants.gen.js';
import { type UInt32 } from './shared.js';
import { VerificationKeyData } from './verification_key.js';

export class VkWitnessData {
  constructor(
    public vk: VerificationKeyData,
    /**
     * Index of the vk in the vk tree.
     */
    public vkIndex: UInt32,
    /**
     * Sibling path of the vk in the vk tree.
     */
    public vkPath: Tuple<Fr, typeof VK_TREE_HEIGHT>,
  ) {}

  static empty() {
    return new VkWitnessData(VerificationKeyData.empty(), 0, makeTuple(VK_TREE_HEIGHT, Fr.zero));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new VkWitnessData(
      reader.readObject(VerificationKeyData),
      reader.readNumber(),
      reader.readArray(VK_TREE_HEIGHT, Fr),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.vk, this.vkIndex, this.vkPath);
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }
}
