import type { Fr } from '@aztec/foundation/schemas';

import { TaggedMemory } from './avm_memory_types.js';

// Allow reading up to 300 kB of return data when unspecified.
const DEFAULT_BEST_EFFORT_READ_CAP = 10000;

export interface LazyReader {
  bestEffortReadAll(readCap?: number): Fr[];
  readAll(): Fr[];
  read(idx: number): Fr | undefined;
  slice(start: number, end: number): Fr[];
  length(): number;
}

export class LazyReaderMemory implements LazyReader {
  constructor(
    private memory: TaggedMemory,
    private offset: number,
    private size: number,
  ) {}

  public bestEffortReadAll(readCap = DEFAULT_BEST_EFFORT_READ_CAP): Fr[] {
    const size = Math.min(this.size, readCap, TaggedMemory.MAX_MEMORY_SIZE - this.offset);
    return this.memory.getSlice(this.offset, size).map(word => word.toFr());
  }

  public read(idx: number): Fr | undefined {
    if (idx >= this.size) {
      return undefined;
    }
    return this.memory.get(this.offset + idx).toFr();
  }

  public slice(start: number, end: number): Fr[] {
    const clampedEnd = Math.min(end, this.size);
    const length = Math.max(0, clampedEnd - start);
    return this.memory.getSlice(this.offset + start, length).map(word => word.toFr());
  }

  public readAll(): Fr[] {
    return this.memory.getSlice(this.offset, this.size).map(word => word.toFr());
  }

  public length(): number {
    return this.size;
  }
}

export class LazyReaderArray implements LazyReader {
  constructor(private array: Fr[]) {}

  public bestEffortReadAll(readCap = DEFAULT_BEST_EFFORT_READ_CAP): Fr[] {
    return this.array.slice(0, readCap);
  }

  public read(idx: number): Fr | undefined {
    return this.array[idx];
  }

  public slice(start: number, end: number): Fr[] {
    return this.array.slice(start, end);
  }

  public readAll(): Fr[] {
    return this.array;
  }

  public length(): number {
    return this.array.length;
  }
}

// Compile time branding to avoid swapping CallData and ReturnData by accident.
declare const CallDataBrand: unique symbol;
declare const ReturnDataBrand: unique symbol;

export type CallData = LazyReader & {
  readonly [CallDataBrand]: true;
};

export type ReturnData = LazyReader & {
  readonly [ReturnDataBrand]: true;
};

export class CallDataArray extends LazyReaderArray implements CallData {
  declare readonly [CallDataBrand]: true;
}

export class CallDataMemory extends LazyReaderMemory implements CallData {
  declare readonly [CallDataBrand]: true;
}

export class ReturnDataArray extends LazyReaderArray implements ReturnData {
  declare readonly [ReturnDataBrand]: true;
}

export class ReturnDataMemory extends LazyReaderMemory implements ReturnData {
  declare readonly [ReturnDataBrand]: true;
}
