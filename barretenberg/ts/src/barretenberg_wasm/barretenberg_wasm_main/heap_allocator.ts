import { type BarretenbergWasmMain } from './index.js';

/**
 * Keeps track of heap allocations so they can be easily freed.
 * The WASM memory layout has 1024 bytes of unused "scratch" space at the start (addresses 0-1023).
 * We can leverage this for IO rather than making expensive bb_malloc bb_free calls.
 * Heap allocations will be created for input/output args that don't fit into the scratch space.
 * Input scratch grows UP from 0, output scratch grows DOWN from 1024, meeting in the middle.
 * This maximizes space utilization while preventing overlap.
 */
export class HeapAllocator {
  private allocs: number[] = [];
  private inScratchPtr = 0; // Next input starts here, grows UP
  private outScratchPtr = 1024; // Next output ends here, grows DOWN

  constructor(private wasm: BarretenbergWasmMain) {}

  getInputs(buffers: (Uint8Array | number)[]) {
    return buffers.map(bufOrNum => {
      if (typeof bufOrNum === 'object') {
        const size = bufOrNum.length;
        // Check if there's room in scratch space (inputs grow up, outputs grow down)
        if (this.inScratchPtr + size <= this.outScratchPtr) {
          const ptr = this.inScratchPtr;
          this.inScratchPtr += size; // Grow UP
          this.wasm.writeMemory(ptr, bufOrNum);
          return ptr;
        } else {
          // Fall back to heap allocation
          const ptr = this.wasm.call('bbmalloc', size);
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

      // Check if there's room in scratch space (inputs grow up, outputs grow down)
      if (this.inScratchPtr + size <= this.outScratchPtr) {
        this.outScratchPtr -= size; // Grow DOWN
        return this.outScratchPtr;
      } else {
        // Fall back to heap allocation
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
