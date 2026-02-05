import { UPDATES_VALUE_SIZE } from '@aztec/constants';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { ScheduledDelayChange } from './scheduled_delay_change.js';
import { ScheduledValueChange } from './scheduled_value_change.js';

export const DELAYED_PUBLIC_MUTABLE_VALUES_LEN = 2 * UPDATES_VALUE_SIZE + 1;

export class DelayedPublicMutableValues {
  constructor(
    public svc: ScheduledValueChange,
    public sdc: ScheduledDelayChange,
  ) {}

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);

    const firstField = reader.readField().toBigInt();

    // Extract fields for ScheduledValueChange
    const svcPre = reader.readFieldArray(UPDATES_VALUE_SIZE);
    const svcPost = reader.readFieldArray(UPDATES_VALUE_SIZE);
    const svcTimestampOfChange = firstField & 0xffffffffn;
    const svc = new ScheduledValueChange(svcPre, svcPost, svcTimestampOfChange);

    // Extract fields for ScheduledDelayChange from first field
    const sdcTimestampOfChange = (firstField >> 32n) & 0xffffffffn;
    const sdcIsPostSome = (firstField >> 64n) & 1n;
    const sdcPost = (firstField >> 72n) & 0xffffffffn;
    const sdcIsPreSome = (firstField >> 104n) & 1n;
    const sdcPre = (firstField >> 112n) & 0xffffffffn;

    const sdc = new ScheduledDelayChange(
      sdcIsPreSome ? sdcPre : undefined,
      sdcIsPostSome ? sdcPost : undefined,
      sdcTimestampOfChange,
    );

    return new this(svc, sdc);
  }

  toFields(): Fr[] {
    // Pack format matches Noir implementation:
    // [ sdc.pre_inner: u32 | sdc.pre_is_some: u8 | sdc.post_inner: u32 | sdc.post_is_some: u8 | sdc.timestamp_of_change: u32 | svc.timestamp_of_change: u32 ]
    let firstField = this.svc.timestampOfChange;
    firstField |= this.sdc.timestampOfChange << 32n;
    firstField |= (this.sdc.post === undefined ? 0n : 1n) << 64n;
    firstField |= BigInt(this.sdc.post || 0) << 72n;
    firstField |= (this.sdc.pre === undefined ? 0n : 1n) << 104n;
    firstField |= BigInt(this.sdc.pre || 0) << 112n;

    return [new Fr(firstField), ...this.svc.previous, ...this.svc.post];
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.toFields());
  }

  static fromBuffer(buffer: Buffer | BufferReader, valueSize: number): DelayedPublicMutableValues {
    const reader = BufferReader.asReader(buffer);
    return DelayedPublicMutableValues.fromFields(reader.readArray(2 * valueSize + 1, Fr));
  }

  static empty(valueSize: number) {
    return new this(ScheduledValueChange.empty(valueSize), ScheduledDelayChange.empty());
  }

  static async readFromTree(delayedPublicMutableSlot: Fr, readStorage: (storageSlot: Fr) => Promise<Fr>) {
    const fieldPromises = Array.from({ length: DELAYED_PUBLIC_MUTABLE_VALUES_LEN }).map((_, i) =>
      readStorage(delayedPublicMutableSlot.add(new Fr(i))),
    );
    return DelayedPublicMutableValues.fromFields(await Promise.all(fieldPromises));
  }

  isEmpty(): boolean {
    return this.svc.isEmpty() && this.sdc.isEmpty();
  }

  writeToTree(delayedPublicMutableSlot: Fr, storageWrite: (storageSlot: Fr, value: Fr) => Promise<void>) {
    const fieldPromises = this.toFields().map((field, i) =>
      storageWrite(delayedPublicMutableSlot.add(new Fr(i)), field),
    );

    return Promise.all(fieldPromises);
  }

  async hash(): Promise<Fr> {
    const fields = this.toFields();
    const hash = await poseidon2Hash(fields);
    return hash;
  }
}
