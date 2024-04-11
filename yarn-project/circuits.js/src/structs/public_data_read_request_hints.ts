import { makeTuple } from '@aztec/foundation/array';
import { BufferReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import { MAX_PUBLIC_DATA_READS_PER_TX } from '../constants.gen.js';
import { PendingReadHint, ReadRequestState, ReadRequestStatus } from './read_request_hints.js';

export class SettledDataReadHint {
  constructor(public readRequestIndex: number, public settledDataHintIndex: number) {}

  static nada(readRequestLen: number) {
    return new SettledDataReadHint(readRequestLen, 0);
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new SettledDataReadHint(reader.readNumber(), reader.readNumber());
  }

  toBuffer() {
    return serializeToBuffer(this.readRequestIndex, this.settledDataHintIndex);
  }
}

export class PublicDataReadRequestHints {
  constructor(
    public readRequestStatuses: Tuple<ReadRequestStatus, typeof MAX_PUBLIC_DATA_READS_PER_TX>,
    public pendingReadHints: Tuple<PendingReadHint, typeof MAX_PUBLIC_DATA_READS_PER_TX>,
    public settledReadHints: Tuple<SettledDataReadHint, typeof MAX_PUBLIC_DATA_READS_PER_TX>,
  ) {}

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicDataReadRequestHints(
      reader.readArray(MAX_PUBLIC_DATA_READS_PER_TX, ReadRequestStatus),
      reader.readArray(MAX_PUBLIC_DATA_READS_PER_TX, PendingReadHint),
      reader.readArray(MAX_PUBLIC_DATA_READS_PER_TX, SettledDataReadHint),
    );
  }

  toBuffer() {
    return serializeToBuffer(this.readRequestStatuses, this.pendingReadHints, this.settledReadHints);
  }
}

export class PublicDataReadRequestHintsBuilder {
  private hints: PublicDataReadRequestHints;
  private numPendingReadHints = 0;
  private numSettledReadHints = 0;

  constructor() {
    this.hints = new PublicDataReadRequestHints(
      makeTuple(MAX_PUBLIC_DATA_READS_PER_TX, ReadRequestStatus.nada),
      makeTuple(MAX_PUBLIC_DATA_READS_PER_TX, () => PendingReadHint.nada(MAX_PUBLIC_DATA_READS_PER_TX)),
      makeTuple(MAX_PUBLIC_DATA_READS_PER_TX, () => SettledDataReadHint.nada(MAX_PUBLIC_DATA_READS_PER_TX)),
    );
  }

  static empty() {
    return new PublicDataReadRequestHintsBuilder().toHints();
  }

  addPendingReadRequest(readRequestIndex: number, publicDataWriteIndex: number) {
    this.hints.readRequestStatuses[readRequestIndex] = new ReadRequestStatus(
      ReadRequestState.PENDING,
      this.numPendingReadHints,
    );
    this.hints.pendingReadHints[this.numPendingReadHints] = new PendingReadHint(readRequestIndex, publicDataWriteIndex);
    this.numPendingReadHints++;
  }

  addSettledReadRequest(readRequestIndex: number, settledDataHintIndex: number) {
    this.hints.readRequestStatuses[readRequestIndex] = new ReadRequestStatus(
      ReadRequestState.SETTLED,
      this.numSettledReadHints,
    );
    this.hints.settledReadHints[this.numSettledReadHints] = new SettledDataReadHint(
      readRequestIndex,
      settledDataHintIndex,
    );
    this.numSettledReadHints++;
  }

  toHints() {
    return this.hints;
  }
}
