import { makeTuple } from '@aztec/foundation/array';
import { BufferReader, Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import { MAX_NULLIFIER_READ_REQUESTS_PER_TX, NULLIFIER_TREE_HEIGHT } from '../constants.gen.js';
import { MembershipWitness } from './membership_witness.js';

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

export class SettledReadHint<TREE_HEIGHT extends number> {
  constructor(public readRequestIndex: number, public membershipWitness: MembershipWitness<TREE_HEIGHT>) {}

  static nada<TREE_HEIGHT extends number>(readRequestLen: number, treeHeight: TREE_HEIGHT) {
    return new SettledReadHint(readRequestLen, MembershipWitness.empty(treeHeight, 0n));
  }

  static fromBuffer<TREE_HEIGHT extends number>(
    buffer: Buffer | BufferReader,
    treeHeight: TREE_HEIGHT,
  ): SettledReadHint<TREE_HEIGHT> {
    const reader = BufferReader.asReader(buffer);
    return new SettledReadHint(reader.readNumber(), MembershipWitness.fromBuffer(reader, treeHeight));
  }

  toBuffer() {
    return serializeToBuffer(this.readRequestIndex, this.membershipWitness);
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
    public settledReadHints: Tuple<SettledReadHint<TREE_HEIGHT>, NUM_SETTLED_READS>,
  ) {}

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
  >(
    buffer: Buffer | BufferReader,
    readRequestLen: READ_REQUEST_LEN,
    numPendingReads: NUM_PENDING_READS,
    numSettledReads: NUM_SETTLED_READS,
    treeHeight: TREE_HEIGHT,
  ): ReadRequestResetHints<READ_REQUEST_LEN, NUM_PENDING_READS, NUM_SETTLED_READS, TREE_HEIGHT> {
    const reader = BufferReader.asReader(buffer);
    return new ReadRequestResetHints(
      reader.readArray(readRequestLen, ReadRequestStatus),
      reader.readArray(numPendingReads, PendingReadHint),
      reader.readArray(numSettledReads, { fromBuffer: r => SettledReadHint.fromBuffer(r, treeHeight) }),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.readRequestStatuses, this.pendingReadHints, this.settledReadHints);
  }
}

export type NullifierReadRequestResetHints = ReadRequestResetHints<
  typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  typeof NULLIFIER_TREE_HEIGHT
>;

export function nullifierReadRequestResetHintsFromBuffer(
  buffer: Buffer | BufferReader,
): NullifierReadRequestResetHints {
  return ReadRequestResetHints.fromBuffer(
    buffer,
    MAX_NULLIFIER_READ_REQUESTS_PER_TX,
    MAX_NULLIFIER_READ_REQUESTS_PER_TX,
    MAX_NULLIFIER_READ_REQUESTS_PER_TX,
    NULLIFIER_TREE_HEIGHT,
  );
}

export class NullifierReadRequestResetHintsBuilder {
  private hints: NullifierReadRequestResetHints;
  private numPendingReadHints = 0;
  private numSettledReadHints = 0;

  constructor() {
    this.hints = new ReadRequestResetHints(
      makeTuple(MAX_NULLIFIER_READ_REQUESTS_PER_TX, ReadRequestStatus.nada),
      makeTuple(MAX_NULLIFIER_READ_REQUESTS_PER_TX, () => PendingReadHint.nada(MAX_NULLIFIER_READ_REQUESTS_PER_TX)),
      makeTuple(MAX_NULLIFIER_READ_REQUESTS_PER_TX, () =>
        SettledReadHint.nada(MAX_NULLIFIER_READ_REQUESTS_PER_TX, NULLIFIER_TREE_HEIGHT),
      ),
    );
  }

  addPendingReadRequest(readRequestIndex: number, nullifierIndex: number) {
    this.hints.readRequestStatuses[readRequestIndex] = new ReadRequestStatus(
      ReadRequestState.PENDING,
      this.numPendingReadHints,
    );
    this.hints.pendingReadHints[this.numPendingReadHints] = new PendingReadHint(readRequestIndex, nullifierIndex);
    this.numPendingReadHints++;
  }

  addSettledReadRequest(readRequestIndex: number, membershipWitness: MembershipWitness<typeof NULLIFIER_TREE_HEIGHT>) {
    this.hints.readRequestStatuses[readRequestIndex] = new ReadRequestStatus(
      ReadRequestState.PENDING,
      this.numSettledReadHints,
    );
    this.hints.settledReadHints[this.numSettledReadHints] = new SettledReadHint(readRequestIndex, membershipWitness);
    this.numSettledReadHints++;
  }

  toHints() {
    return this.hints;
  }
}
