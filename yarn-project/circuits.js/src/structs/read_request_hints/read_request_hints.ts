import { makeTuple } from '@aztec/foundation/array';
import { BufferReader, type Bufferable, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import { MembershipWitness } from '../membership_witness.js';

export enum ReadRequestState {
  NADA = 0,
  PENDING = 1,
  SETTLED = 2,
}

export class ReadRequestStatus {
  constructor(public state: ReadRequestState, public hintIndex: number) {}

  static nada() {
    return new ReadRequestStatus(ReadRequestState.NADA, 0);
  }

  static pending(hintIndex: number) {
    return new ReadRequestStatus(ReadRequestState.PENDING, hintIndex);
  }

  static settled(hintIndex: number) {
    return new ReadRequestStatus(ReadRequestState.SETTLED, hintIndex);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new ReadRequestStatus(reader.readNumber(), reader.readNumber());
  }

  toBuffer() {
    return serializeToBuffer(this.state, this.hintIndex);
  }
}

export class PendingReadHint {
  constructor(public readRequestIndex: number, public pendingValueIndex: number) {}

  static nada(readRequestLen: number) {
    return new PendingReadHint(readRequestLen, 0);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PendingReadHint(reader.readNumber(), reader.readNumber());
  }

  toBuffer() {
    return serializeToBuffer(this.readRequestIndex, this.pendingValueIndex);
  }
}

export class SettledReadHint<TREE_HEIGHT extends number, LEAF_PREIMAGE extends Bufferable> {
  constructor(
    public readRequestIndex: number,
    public membershipWitness: MembershipWitness<TREE_HEIGHT>,
    public leafPreimage: LEAF_PREIMAGE,
  ) {}

  static nada<TREE_HEIGHT extends number, LEAF_PREIMAGE extends Bufferable>(
    readRequestLen: number,
    treeHeight: TREE_HEIGHT,
    emptyLeafPreimage: () => LEAF_PREIMAGE,
  ) {
    return new SettledReadHint(readRequestLen, MembershipWitness.empty(treeHeight), emptyLeafPreimage());
  }

  static fromBuffer<TREE_HEIGHT extends number, LEAF_PREIMAGE extends Bufferable>(
    buffer: Buffer | BufferReader,
    treeHeight: TREE_HEIGHT,
    leafPreimage: { fromBuffer(buffer: BufferReader): LEAF_PREIMAGE },
  ): SettledReadHint<TREE_HEIGHT, LEAF_PREIMAGE> {
    const reader = BufferReader.asReader(buffer);
    return new SettledReadHint(
      reader.readNumber(),
      MembershipWitness.fromBuffer(reader, treeHeight),
      reader.readObject(leafPreimage),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.readRequestIndex, this.membershipWitness, this.leafPreimage);
  }
}

/**
 * Hints for read request reset circuit.
 */
export class ReadRequestResetHints<
  READ_REQUEST_LEN extends number,
  NUM_PENDING_READS extends number,
  NUM_SETTLED_READS extends number,
  TREE_HEIGHT extends number,
  LEAF_PREIMAGE extends Bufferable,
> {
  constructor(
    public readRequestStatuses: Tuple<ReadRequestStatus, READ_REQUEST_LEN>,
    /**
     * The hints for read requests reading pending values.
     */
    public pendingReadHints: Tuple<PendingReadHint, NUM_PENDING_READS>,
    /**
     * The hints for read requests reading settled values.
     */
    public settledReadHints: Tuple<SettledReadHint<TREE_HEIGHT, LEAF_PREIMAGE>, NUM_SETTLED_READS>,
  ) {}

  trimToSizes<NEW_NUM_PENDING_READS extends number, NEW_NUM_SETTLED_READS extends number>(
    numPendingReads: NEW_NUM_PENDING_READS,
    numSettledReads: NEW_NUM_SETTLED_READS,
  ): ReadRequestResetHints<READ_REQUEST_LEN, NEW_NUM_PENDING_READS, NEW_NUM_SETTLED_READS, TREE_HEIGHT, LEAF_PREIMAGE> {
    return new ReadRequestResetHints(
      this.readRequestStatuses,
      this.pendingReadHints.slice(0, numPendingReads) as Tuple<PendingReadHint, NEW_NUM_PENDING_READS>,
      this.settledReadHints.slice(0, numSettledReads) as Tuple<
        SettledReadHint<TREE_HEIGHT, LEAF_PREIMAGE>,
        NEW_NUM_SETTLED_READS
      >,
    );
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer<
    READ_REQUEST_LEN extends number,
    NUM_PENDING_READS extends number,
    NUM_SETTLED_READS extends number,
    TREE_HEIGHT extends number,
    LEAF_PREIMAGE extends Bufferable,
  >(
    buffer: Buffer | BufferReader,
    readRequestLen: READ_REQUEST_LEN,
    numPendingReads: NUM_PENDING_READS,
    numSettledReads: NUM_SETTLED_READS,
    treeHeight: TREE_HEIGHT,
    leafPreimageFromBuffer: { fromBuffer: (buffer: BufferReader) => LEAF_PREIMAGE },
  ): ReadRequestResetHints<READ_REQUEST_LEN, NUM_PENDING_READS, NUM_SETTLED_READS, TREE_HEIGHT, LEAF_PREIMAGE> {
    const reader = BufferReader.asReader(buffer);
    return new ReadRequestResetHints(
      reader.readArray(readRequestLen, ReadRequestStatus),
      reader.readArray(numPendingReads, PendingReadHint),
      reader.readArray(numSettledReads, {
        fromBuffer: r => SettledReadHint.fromBuffer(r, treeHeight, leafPreimageFromBuffer),
      }),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.readRequestStatuses, this.pendingReadHints, this.settledReadHints);
  }
}

export class ReadRequestResetStates<NUM_READS extends number> {
  constructor(public states: Tuple<ReadRequestState, NUM_READS>, public pendingReadHints: PendingReadHint[]) {}

  static empty<NUM_READS extends number>(numReads: NUM_READS) {
    return new ReadRequestResetStates(
      makeTuple(numReads, () => ReadRequestState.NADA),
      [],
    );
  }
}
