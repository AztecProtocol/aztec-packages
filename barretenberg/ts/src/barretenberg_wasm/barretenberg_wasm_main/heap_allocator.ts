import { type BarretenbergWasmMain } from './index.js';

/**
 * Keeps track of heap allocations so they can be easily freed.
 * The WASM memory layout has 1024 bytes of unused "scratch" space at the start (addresses 0-1023).
 * We can leverage this for IO rather than making expensive bb_malloc bb_free calls.
 * Heap allocations will be created for input/output args that don't fit into the scratch space.
 * Input scratch uses the lower half (0-511), output scratch uses the upper half (512-1023).
 */
export class HeapAllocator {
  private allocs: number[] = [];
  private inScratchRemaining = 512;
  private outScratchRemaining = 512;

  constructor(private wasm: BarretenbergWasmMain) {}

  getInputs(buffers: (Uint8Array | number)[]) {
    return buffers.map(bufOrNum => {
      if (typeof bufOrNum === 'object') {
        if (bufOrNum.length <= this.inScratchRemaining) {
          const ptr = (this.inScratchRemaining -= bufOrNum.length);
          this.wasm.writeMemory(ptr, bufOrNum);
          return ptr;
        } else {
          const ptr = this.wasm.call('bbmalloc', bufOrNum.length);
          this.wasm.writeMemory(ptr, bufOrNum);
          this.allocs.push(ptr);
          return ptr;
        }
      } else {
        return bufOrNum;
      }
    });
  }

  getOutputPtrs(outLens: (number | undefined)[]) {
    return outLens.map(len => {
      // If the obj is variable length, we need a 4 byte ptr to write the serialized data address to.
      // WARNING: 4 only works with WASM as it has 32 bit memory.
      const size = len || 4;

      if (size <= this.outScratchRemaining) {
        // Output scratch space: 512-1023 (grows down from 1024)
        const ptr = 1024 - (512 - this.outScratchRemaining) - size;
        this.outScratchRemaining -= size;
        return ptr;
      } else {
        const ptr = this.wasm.call('bbmalloc', size);
        this.allocs.push(ptr);
        return ptr;
      }
    });
  }

  addOutputPtr(ptr: number) {
    // Only add to dealloc list if it's a heap allocation (not in scratch space 0-1023)
    if (ptr >= 1024) {
      this.allocs.push(ptr);
    }
  }

  freeAll() {
    for (const ptr of this.allocs) {
      this.wasm.call('bbfree', ptr);
    }
  }
}
