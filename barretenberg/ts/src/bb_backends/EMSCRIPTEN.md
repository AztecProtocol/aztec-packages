# Emscripten Backend for Address Sanitizer Debugging

Emscripten builds with address sanitizer (ASAN) are ONLY for debugging memory issues. They are ~30x larger and significantly slower than production WASI builds.

## Building Emscripten WASM with ASAN

```bash
cd ../cpp
./bootstrap.sh build_emscripten_threads_asan
```

This generates:
- `build-emscripten-threads-asan/bin/barretenberg-debug.wasm.wasm` - The WASM module (large ~250MB)
- `build-emscripten-threads-asan/bin/barretenberg-debug.wasm.js` - Emscripten JS glue code

## Creating an Emscripten Backend

The existing `BarretenbergWasmAsyncBackend` and `BarretenbergWasmSyncBackend` in `wasm.ts` use direct WebAssembly APIs and are incompatible with emscripten's JS glue code.

To use emscripten WASM, create a new backend class that:

1. Implements `IMsgpackBackendSync` or `IMsgpackBackendAsync`
2. Loads the emscripten-generated JS file
3. Calls into the emscripten module's exported functions

### Example Structure

```typescript
import { IMsgpackBackendAsync } from './interface.js';

export class BarretenbergEmscriptenBackend implements IMsgpackBackendAsync {
  private module: any;

  static async new(): Promise<BarretenbergEmscriptenBackend> {
    // Load emscripten JS glue code
    const createModule = await import('../path/to/barretenberg-debug.wasm.js');

    // Initialize emscripten module
    const module = await createModule.default({
      // Emscripten module configuration
      wasmBinary: await fetch('barretenberg-debug.wasm.wasm')
        .then(r => r.arrayBuffer()),
    });

    return new BarretenbergEmscriptenBackend(module);
  }

  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    // Call into emscripten module's exported bbapi function
    // This requires understanding how emscripten exports work
    return this.module.ccall('bbapi', 'array', ['array'], [inputBuffer]);
  }

  async destroy(): Promise<void> {
    // Clean up emscripten module resources
  }
}
```

### Key Differences from WASI Backend

- **Memory Management**: Emscripten manages memory differently (needs more initial memory for ASAN)
- **Module Loading**: Must use emscripten's JS glue code, not direct `WebAssembly.instantiate()`
- **Function Calls**: Emscripten exports via `ccall`/`cwrap`, not direct WASM exports
- **Undefined Symbols**: Runtime-provided functions (logstr, etc.) are defined in the JS glue code

## When to Use

**Only use emscripten ASAN builds when:**
- Debugging suspected memory corruption issues (buffer overflows, use-after-free, etc.)
- You need detailed memory error reports with stack traces
- The performance overhead (~30x slower) and size (~30x larger) are acceptable for debugging

**For all other cases, use the default WASI builds** which are production-ready and optimized.

## Example Debug Workflow

1. Build ASAN version: `./cpp/bootstrap.sh build_emscripten_threads_asan`
2. Create custom backend (see example above)
3. Run your test/code that triggers the memory issue
4. ASAN will report detailed information about memory errors:
   - Exact location of buffer overflow
   - Stack traces showing allocation and access
   - Type of memory error (heap-use-after-free, stack-buffer-overflow, etc.)
5. Fix the issue
6. Switch back to WASI builds for normal development

## Resources

- Emscripten ASAN docs: https://emscripten.org/docs/debugging/Sanitizers.html
- Emscripten module loading: https://emscripten.org/docs/api_reference/module.html
