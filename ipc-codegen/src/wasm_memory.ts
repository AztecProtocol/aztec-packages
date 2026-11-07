/**
 * A wasm module's memory import, read from its binary. A host has to create an imported memory
 * that satisfies the import's limits, and JS can't read them from a compiled module, so a generated
 * package records them from its modules when it is built.
 */

/** A memory import as declared, in 64 KiB pages; matches ipc-runtime's `WasmMemoryImport`. */
export interface WasmMemoryImport {
  initial: number;
  /** Absent when the module declares no maximum. */
  maximum?: number;
  shared: boolean;
}

const IMPORT_SECTION = 2;

class Reader {
  offset = 0;
  private readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  byte(): number {
    if (this.offset >= this.bytes.length) {
      throw new Error("truncated wasm module");
    }
    return this.bytes[this.offset++]!;
  }

  u32(): number {
    let result = 0;
    for (let shift = 0; shift < 35; shift += 7) {
      const byte = this.byte();
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) {
        return result;
      }
    }
    throw new Error("malformed LEB128 in wasm module");
  }

  /** A signed LEB128, only skipped (a heap type index). */
  skipSleb(): void {
    while (this.byte() & 0x80) {}
  }

  skip(n: number): void {
    this.offset += n;
  }

  name(): string {
    const length = this.u32();
    const name = new TextDecoder().decode(
      this.bytes.subarray(this.offset, this.offset + length),
    );
    this.offset += length;
    return name;
  }

  /** A value type: one byte, or a reference type with its heap type. */
  skipValType(): void {
    const type = this.byte();
    if (type === 0x63 || type === 0x64) {
      this.skipSleb();
    }
  }

  /** Table and memory limits: flags, then the minimum and an optional maximum. */
  limits(): { flags: number; initial: number; maximum?: number } {
    const flags = this.byte();
    if (flags & 0x04) {
      throw new Error("64-bit memories are not supported");
    }
    const initial = this.u32();
    const maximum = flags & 0x01 ? this.u32() : undefined;
    return { flags, initial, maximum };
  }
}

/**
 * The module's memory import, or undefined when it imports none (it defines its own memory, or
 * none at all).
 */
export function readMemoryImport(
  bytes: Uint8Array,
): WasmMemoryImport | undefined {
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x00 ||
    bytes[1] !== 0x61 ||
    bytes[2] !== 0x73 ||
    bytes[3] !== 0x6d
  ) {
    throw new Error(
      "not a wasm module (a gzipped one has to be decompressed first)",
    );
  }
  const reader = new Reader(bytes);
  reader.skip(8);
  while (reader.offset < bytes.length) {
    const id = reader.byte();
    const size = reader.u32();
    if (id !== IMPORT_SECTION) {
      reader.skip(size);
      continue;
    }
    const count = reader.u32();
    for (let i = 0; i < count; i++) {
      reader.name();
      reader.name();
      const kind = reader.byte();
      switch (kind) {
        case 0x00: // function: a type index
          reader.u32();
          break;
        case 0x01: // table: a reference type, then limits
          reader.skipValType();
          reader.limits();
          break;
        case 0x02: {
          // memory
          const { flags, initial, maximum } = reader.limits();
          return { initial, maximum, shared: (flags & 0x02) !== 0 };
        }
        case 0x03: // global: a value type, then mutability
          reader.skipValType();
          reader.byte();
          break;
        case 0x04: // tag: an attribute, then a type index
          reader.byte();
          reader.u32();
          break;
        default:
          throw new Error(
            `unknown import kind 0x${kind.toString(16)} in wasm module`,
          );
      }
    }
    return undefined;
  }
  return undefined;
}
