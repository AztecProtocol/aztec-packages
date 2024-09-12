import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import {
  L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PUBLIC_DATA_HINTS,
  NOTE_HASH_TREE_HEIGHT,
} from '../../constants.gen.js';
import {
  type NullifierNonExistentReadRequestHints,
  nullifierNonExistentReadRequestHintsFromBuffer,
} from '../non_existent_read_request_hints.js';
import { PartialStateReference } from '../partial_state_reference.js';
import { PublicDataLeafHint } from '../public_data_leaf_hint.js';
import { type NullifierReadRequestHints, nullifierReadRequestHintsFromBuffer } from '../read_request_hints/index.js';
import { TreeLeafReadRequestHint } from '../tree_leaf_read_request_hint.js';
import { PublicKernelData } from './public_kernel_data.js';

export class PublicKernelTailCircuitPrivateInputs {
  constructor(
    /**
     * Kernels are recursive and this is the data from the previous kernel.
     */
    public readonly previousKernel: PublicKernelData,
    public readonly noteHashReadRequestHints: Tuple<
      TreeLeafReadRequestHint<typeof NOTE_HASH_TREE_HEIGHT>,
      typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX
    >,
    /**
     * Contains hints for the nullifier read requests to locate corresponding pending or settled nullifiers.
     */
    public readonly nullifierReadRequestHints: NullifierReadRequestHints<
      typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX,
      typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX
    >,
    /**
     * Contains hints for the nullifier non existent read requests.
     */
    public readonly nullifierNonExistentReadRequestHints: NullifierNonExistentReadRequestHints,
    public readonly l1ToL2MsgReadRequestHints: Tuple<
      TreeLeafReadRequestHint<typeof L1_TO_L2_MSG_TREE_HEIGHT>,
      typeof MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX
    >,
    public readonly publicDataHints: Tuple<PublicDataLeafHint, typeof MAX_PUBLIC_DATA_HINTS>,
    public readonly startState: PartialStateReference,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.previousKernel,
      this.noteHashReadRequestHints,
      this.nullifierReadRequestHints,
      this.nullifierNonExistentReadRequestHints,
      this.l1ToL2MsgReadRequestHints,
      this.publicDataHints,
      this.startState,
    );
  }

  toString() {
    return this.toBuffer().toString('hex');
  }

  static fromString(str: string) {
    return PublicKernelTailCircuitPrivateInputs.fromBuffer(Buffer.from(str, 'hex'));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicKernelTailCircuitPrivateInputs(
      reader.readObject(PublicKernelData),
      reader.readArray(MAX_NOTE_HASH_READ_REQUESTS_PER_TX, {
        fromBuffer: buf => TreeLeafReadRequestHint.fromBuffer(buf, NOTE_HASH_TREE_HEIGHT),
      }),
      nullifierReadRequestHintsFromBuffer(
        reader,
        MAX_NULLIFIER_READ_REQUESTS_PER_TX,
        MAX_NULLIFIER_READ_REQUESTS_PER_TX,
      ),
      nullifierNonExistentReadRequestHintsFromBuffer(reader),
      reader.readArray(MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_TX, {
        fromBuffer: buf => TreeLeafReadRequestHint.fromBuffer(buf, L1_TO_L2_MSG_TREE_HEIGHT),
      }),
      reader.readArray(MAX_PUBLIC_DATA_HINTS, PublicDataLeafHint),
      reader.readObject(PartialStateReference),
    );
  }

  clone() {
    return PublicKernelTailCircuitPrivateInputs.fromBuffer(this.toBuffer());
  }
}
