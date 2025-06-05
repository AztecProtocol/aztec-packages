import { makeTuple } from '@aztec/foundation/array';
import { BufferReader, type Bufferable, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';
import { MembershipWitness } from '@aztec/foundation/trees';

export enum ReadRequestState {
  NADA = 0,
  PENDING = 1,
  SETTLED = 2,
}

export class ReadRequestStatus {
  constructor(
    public state: ReadRequestState,
    public hintIndex: number,
  ) {}

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
  constructor(
    public readRequestIndex: number,
    public pendingValueIndex: number,
  ) {}

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
  PENDING_READ_HINTS_LEN extends number,
  SETTLED_READ_HINTS_LEN extends number,
  TREE_HEIGHT extends number,
  LEAF_PREIMAGE extends Bufferable,
> {
  constructor(
    public readRequestStatuses: Tuple<ReadRequestStatus, READ_REQUEST_LEN>,
    /**
     * The hints for read requests reading pending values.
     */
    public pendingReadHints: Tuple<PendingReadHint, PENDING_READ_HINTS_LEN>,
    /**
     * The hints for read requests reading settled values.
     */
    public settledReadHints: Tuple<SettledReadHint<TREE_HEIGHT, LEAF_PREIMAGE>, SETTLED_READ_HINTS_LEN>,
  ) {}

  trimToSizes<NEW_PENDING_READ_HINTS_LEN extends number, NEW_SETTLED_READ_HINTS_LEN extends number>(
    numPendingReads: NEW_PENDING_READ_HINTS_LEN,
    numSettledReads: NEW_SETTLED_READ_HINTS_LEN,
  ): ReadRequestResetHints<
    READ_REQUEST_LEN,
    NEW_PENDING_READ_HINTS_LEN,
    NEW_SETTLED_READ_HINTS_LEN,
    TREE_HEIGHT,
    LEAF_PREIMAGE
  > {
    return new ReadRequestResetHints(
      this.readRequestStatuses,
      this.pendingReadHints.slice(0, numPendingReads) as Tuple<PendingReadHint, NEW_PENDING_READ_HINTS_LEN>,
      this.settledReadHints.slice(0, numSettledReads) as Tuple<
        SettledReadHint<TREE_HEIGHT, LEAF_PREIMAGE>,
        NEW_SETTLED_READ_HINTS_LEN
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
    PENDING_READ_HINTS_LEN extends number,
    SETTLED_READ_HINTS_LEN extends number,
    TREE_HEIGHT extends number,
    LEAF_PREIMAGE extends Bufferable,
  >(
    buffer: Buffer | BufferReader,
    readRequestLen: READ_REQUEST_LEN,
    numPendingReads: PENDING_READ_HINTS_LEN,
    numSettledReads: SETTLED_READ_HINTS_LEN,
    treeHeight: TREE_HEIGHT,
    leafPreimageFromBuffer: { fromBuffer: (buffer: BufferReader) => LEAF_PREIMAGE },
  ): ReadRequestResetHints<
    READ_REQUEST_LEN,
    PENDING_READ_HINTS_LEN,
    SETTLED_READ_HINTS_LEN,
    TREE_HEIGHT,
    LEAF_PREIMAGE
  > {
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
  constructor(
    public states: Tuple<ReadRequestState, NUM_READS>,
    public pendingReadHints: PendingReadHint[],
  ) {}

  static empty<NUM_READS extends number>(numReads: NUM_READS) {
    return new ReadRequestResetStates(
      makeTuple(numReads, () => ReadRequestState.NADA),
      [],
    );
  }
}
