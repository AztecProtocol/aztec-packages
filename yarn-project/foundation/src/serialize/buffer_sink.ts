/**
 * A value that can be appended to a {@link BufferSink}. Mirrors `Bufferable`, but the object arm allows the
 * optional-sink overload of `toBuffer` so a legacy `toBuffer(): Buffer` and a migrated `toBuffer(sink?)` both fit.
 */
export type Sinkable =
  | boolean
  | Buffer
  | Uint8Array
  | number
  | bigint
  | string
  | { toBuffer(sink?: BufferSink): Buffer | void }
  | Sinkable[];

const DEFAULT_INITIAL_CAPACITY = 1024;
const MASK_64 = (1n << 64n) - 1n;

/**
 * A growable, append-only binary sink backed by a single `ArrayBuffer`.
 *
 * It exists to replace the recursive `toBuffer()` chain — which allocates a `Buffer` at every node and
 * `Buffer.concat`s at every level — with one buffer that the whole object graph streams into and that is sliced
 * exactly once at the root. Encodings are big-endian, matching `serializeToBuffer` byte-for-byte.
 *
 * The migration contract is the optional-sink `toBuffer`:
 *
 * ```ts
 * toBuffer(): Buffer;
 * toBuffer(sink: BufferSink): void;
 * toBuffer(sink?: BufferSink): Buffer | void {
 *   if (!sink) return BufferSink.serialize(this); // own a sink, fill it, slice once
 *   serializeToSink(sink, this.a, this.b, this.c); // stream into the caller's sink
 * }
 * ```
 *
 * When a sink is passed it writes and returns `undefined`; otherwise it returns its own buffer. Nodes that have
 * not been migrated keep their plain `toBuffer(): Buffer` and are folded in via the return-value fallback in
 * {@link serializeToSink}, so the tree stays valid at every step of an incremental migration.
 *
 * Performance note: bigints are written via `DataView.setBigUint64` limbs ({@link writeBigInt},
 * {@link writeField}), NOT a per-byte shift loop. The limb form is ~16x faster than the legacy hex round-trip
 * on field-heavy structures, and faster than the legacy path at every width — a naive per-byte shift loop is
 * actually the slowest option, since each byte allocates a fresh BigInt. See the spike benchmark.
 */
export class BufferSink {
  private buffer: Uint8Array;
  private view: DataView;
  private offset = 0;

  constructor(initialCapacity: number = DEFAULT_INITIAL_CAPACITY) {
    const ab = new ArrayBuffer(initialCapacity);
    this.buffer = new Uint8Array(ab);
    this.view = new DataView(ab);
  }

  /** Number of bytes written so far. */
  public get length(): number {
    return this.offset;
  }

  /**
   * Serialize a migrated value into a fresh sink and return the single resulting buffer. This is the no-sink
   * branch of every migrated `toBuffer`: one allocation, one slice, only at the root.
   *
   * @param obj - The value to serialize via its sink-aware `toBuffer`.
   * @param initialCapacity - Optional size hint (e.g. from `getSize()`) to skip reallocations on hot paths.
   */
  public static serialize(obj: { toBuffer(sink: BufferSink): void }, initialCapacity?: number): Buffer {
    const sink = new BufferSink(initialCapacity);
    obj.toBuffer(sink);
    return sink.toBuffer();
  }

  private ensure(extra: number): void {
    const required = this.offset + extra;
    if (required <= this.buffer.length) {
      return;
    }
    let next = this.buffer.length * 2;
    while (next < required) {
      next *= 2;
    }
    const grown = new Uint8Array(next);
    grown.set(this.buffer.subarray(0, this.offset));
    this.buffer = grown;
    this.view = new DataView(grown.buffer);
  }

  /** Append a single byte (0/1) for a boolean, matching `boolToBuffer`. */
  public writeBool(value: boolean): void {
    this.ensure(1);
    this.buffer[this.offset++] = value ? 1 : 0;
  }

  /** Append an unsigned 8-bit integer. */
  public writeUInt8(value: number): void {
    this.ensure(1);
    this.buffer[this.offset++] = value & 0xff;
  }

  /** Append a big-endian unsigned 16-bit integer. */
  public writeUInt16(value: number): void {
    this.ensure(2);
    this.view.setUint16(this.offset, value, false);
    this.offset += 2;
  }

  /** Append a big-endian unsigned 32-bit integer, matching `numToUInt32BE`. */
  public writeNumber(value: number): void {
    this.ensure(4);
    this.view.setUint32(this.offset, value, false);
    this.offset += 4;
  }

  /** Append a big-endian unsigned 64-bit integer, matching `bigintToUInt64BE`. */
  public writeUInt64(value: bigint): void {
    this.ensure(8);
    this.view.setBigUint64(this.offset, value, false);
    this.offset += 8;
  }

  /**
   * Append a non-negative bigint as a big-endian unsigned integer of `width` bytes (default 32), matching
   * `serializeBigInt` / `toBufferBE`. Every width is written limb-wise via `setBigUint64` rather than the
   * legacy per-byte BigInt shift loop — that loop allocated a fresh BigInt per byte and benchmarked as the
   * *slowest* option (slower even than the legacy hex round-trip); the limb form is faster at every width.
   *
   * The bulk of the value is written as 64-bit big-endian limbs from the least-significant tail upward, and
   * a final `width % 8` (at most 7) high bytes that don't fill a whole limb are written individually. The
   * common widths (8/16/32) are exact multiples of 8, so they take the pure-limb path with no remainder.
   * `width === 32` keeps its own straight-line four-limb form (shared with {@link writeField}) since it is
   * the `Fr`/`Fq`/Chonk-proof hot path and the unrolled body is marginally faster than the loop.
   *
   * @param value - The non-negative bigint to serialize.
   * @param width - Output width in bytes.
   */
  public writeBigInt(value: bigint, width = 32): void {
    if (value < 0n) {
      throw new Error(`Cannot serialize negative bigint ${value}`);
    }
    this.ensure(width);
    const o = this.offset;
    if (width === 32) {
      let x = value;
      this.view.setBigUint64(o + 24, x & MASK_64, false);
      x >>= 64n;
      this.view.setBigUint64(o + 16, x & MASK_64, false);
      x >>= 64n;
      this.view.setBigUint64(o + 8, x & MASK_64, false);
      x >>= 64n;
      this.view.setBigUint64(o, x & MASK_64, false);
      x >>= 64n;
      if (x !== 0n) {
        throw new Error(`BigInt ${value} does not fit into 32 bytes`);
      }
      this.offset += 32;
      return;
    }
    let x = value;
    let pos = o + width;
    while (pos - 8 >= o) {
      pos -= 8;
      this.view.setBigUint64(pos, x & MASK_64, false);
      x >>= 64n;
    }
    for (let i = pos - 1; i >= o; i--) {
      this.buffer[i] = Number(x & 0xffn);
      x >>= 8n;
    }
    if (x !== 0n) {
      throw new Error(`BigInt ${value} does not fit into ${width} bytes`);
    }
    this.offset += width;
  }

  /**
   * Append a 32-byte (256-bit) big-endian non-negative bigint. Specialized form of {@link writeBigInt}
   * with no width parameter and no width-branch, so V8 can inline the four `setBigUint64` limb writes
   * without the wider branchy form's instability. This is the Fr/Fq leaf hot path; prefer it over
   * `writeBigInt(value, 32)` in callers that always serialize 32-byte fields.
   */
  public writeField(value: bigint): void {
    if (value < 0n) {
      throw new Error(`Cannot serialize negative bigint ${value}`);
    }
    this.ensure(32);
    const o = this.offset;
    let x = value;
    this.view.setBigUint64(o + 24, x & MASK_64, false);
    x >>= 64n;
    this.view.setBigUint64(o + 16, x & MASK_64, false);
    x >>= 64n;
    this.view.setBigUint64(o + 8, x & MASK_64, false);
    x >>= 64n;
    this.view.setBigUint64(o, x & MASK_64, false);
    if (x >> 64n !== 0n) {
      throw new Error(`BigInt ${value} does not fit into 32 bytes`);
    }
    this.offset = o + 32;
  }

  /**
   * Append an array of field elements (or any objects exposing `toBigInt(): bigint`) as a contiguous
   * sequence of 32-byte big-endian limbs. Iterates inline — no per-element `toBuffer` dispatch and no
   * per-element function-call indirection through the generic sinkable dispatcher. Use this in classes
   * that hold large flat field arrays (e.g. the 1632-element ChonkProof field list).
   */
  public writeFields(fields: ReadonlyArray<{ toBigInt(): bigint }>): void {
    this.ensure(32 * fields.length);
    for (let i = 0, n = fields.length; i < n; i++) {
      const value = fields[i].toBigInt();
      if (value < 0n) {
        throw new Error(`Cannot serialize negative bigint ${value}`);
      }
      const o = this.offset;
      let x = value;
      this.view.setBigUint64(o + 24, x & MASK_64, false);
      x >>= 64n;
      this.view.setBigUint64(o + 16, x & MASK_64, false);
      x >>= 64n;
      this.view.setBigUint64(o + 8, x & MASK_64, false);
      x >>= 64n;
      this.view.setBigUint64(o, x & MASK_64, false);
      if (x >> 64n !== 0n) {
        throw new Error(`BigInt ${value} does not fit into 32 bytes`);
      }
      this.offset = o + 32;
    }
  }

  /** Append raw bytes verbatim (no length prefix), matching how a `Buffer`/`Uint8Array` is serialized inline. */
  public writeBytes(bytes: Uint8Array): void {
    this.ensure(bytes.length);
    this.buffer.set(bytes, this.offset);
    this.offset += bytes.length;
  }

  /** Append a string as a 4-byte big-endian length prefix followed by its UTF-8 bytes, matching the string case. */
  public writeString(value: string): void {
    const bytes = Buffer.from(value);
    this.writeNumber(bytes.length);
    this.writeBytes(bytes);
  }

  /**
   * Reset the write cursor without releasing the backing buffer. Lets the same sink be reused across many
   * serializations without reallocating — the per-call cost drops to the bytes written (no `new ArrayBuffer`).
   * Any `Buffer` previously returned by {@link toBuffer} is a fresh copy and remains valid; any view from
   * {@link asUint8Array} aliases the buffer and is invalidated.
   */
  public reset(): void {
    this.offset = 0;
  }

  /** Copy the written region into a freshly allocated `Buffer`. The single allocation of the whole serialization. */
  public toBuffer(): Buffer {
    return Buffer.from(this.buffer.subarray(0, this.offset));
  }

  /** A zero-copy view of the written region. Valid only until the next write (which may reallocate). */
  public asUint8Array(): Uint8Array {
    return this.buffer.subarray(0, this.offset);
  }
}

/**
 * Streaming counterpart to `serializeToBufferArray`: walk a list of {@link Sinkable}s and append each to the sink.
 * Dispatch matches `serializeToBufferArray` byte-for-byte. An object is serialized via `obj.toBuffer(sink)`; a
 * migrated node writes into the sink and returns `undefined`, while a not-yet-migrated node ignores the argument
 * and returns its `Buffer`, which we copy in. That return-value fallback is what makes the migration incremental.
 *
 * Dispatch is hot-pathed for the common case of objects exposing `toBuffer` (Fr/Fq and every other migrated leaf),
 * and arrays recurse via an inner-array helper to avoid the per-call rest-args allocation that a spread-recurse
 * would force on large flat arrays like the 1632-element ChonkProof field list.
 *
 * @param sink - The destination sink.
 * @param objs - The values to serialize, in order.
 */
export function serializeToSink(sink: BufferSink, ...objs: Sinkable[]): void {
  serializeArrayToSinkInner(sink, objs);
}

function serializeArrayToSinkInner(sink: BufferSink, objs: Sinkable[]): void {
  for (let i = 0, n = objs.length; i < n; i++) {
    serializeOneToSink(sink, objs[i]);
  }
}

function serializeOneToSink(sink: BufferSink, obj: Sinkable): void {
  if (typeof obj === 'object' && obj !== null) {
    // Hot path: migrated nodes (anything implementing toBuffer, including Fr/Fq via BaseField). This branch
    // is taken for the vast majority of recursive serialization, so it is checked before the typeof primitives.
    if ((obj as any).toBuffer !== undefined) {
      const ret = (obj as { toBuffer(sink: BufferSink): Buffer | void }).toBuffer(sink);
      if (ret !== undefined) {
        sink.writeBytes(ret);
      }
      return;
    }
    if (Array.isArray(obj)) {
      serializeArrayToSinkInner(sink, obj);
      return;
    }
    if (Buffer.isBuffer(obj) || obj instanceof Uint8Array) {
      sink.writeBytes(obj);
      return;
    }
    throw new Error(`Cannot serialize input to sink: ${typeof obj} ${(obj as any).constructor?.name}`);
  }
  if (typeof obj === 'boolean') {
    sink.writeBool(obj);
  } else if (typeof obj === 'bigint') {
    sink.writeBigInt(obj);
  } else if (typeof obj === 'number') {
    sink.writeNumber(obj);
  } else if (typeof obj === 'string') {
    sink.writeString(obj);
  } else {
    throw new Error(`Cannot serialize input to sink: ${typeof obj}`);
  }
}

/**
 * Streaming counterpart to `serializeArrayOfBufferableToVector`: write a length prefix (1 or 4 bytes) giving the
 * number of serialized elements, then each element. Byte-identical to the buffer version.
 *
 * @param sink - The destination sink.
 * @param objs - The vector elements.
 * @param prefixLength - Width of the count prefix in bytes (1 or 4).
 */
export function serializeArrayToSink(sink: BufferSink, objs: Sinkable[], prefixLength = 4): void {
  const count = countSinkables(objs);
  if (prefixLength === 1) {
    sink.writeUInt8(count);
  } else if (prefixLength === 4) {
    sink.writeNumber(count);
  } else {
    throw new Error(`Unsupported prefix length. Got ${prefixLength}, expected 1 or 4`);
  }
  serializeArrayToSinkInner(sink, objs);
}

/** Count how many top-level buffers `serializeToBufferArray` would emit, flattening nested arrays as it does. */
function countSinkables(objs: Sinkable[]): number {
  let count = 0;
  for (const obj of objs) {
    count += Array.isArray(obj) ? countSinkables(obj) : 1;
  }
  return count;
}
