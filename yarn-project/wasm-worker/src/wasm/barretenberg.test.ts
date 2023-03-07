import isNode from 'detect-node';
import { WasmModule } from './wasm_module.js';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import { dirname } from 'path';
import { NodeDataStore } from '../worker/node/node_data_store.js';
import { WebDataStore } from '../worker/browser/web_data_store.js';
import { AsyncCallState, AsyncFnState } from './async_call_state.js';

async function fetchCode() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return await readFile(`${__dirname}/../../../../../barretenberg/cpp/build-wasm/bin/barretenberg.wasm`);
}

function stringFromAddress(module: WasmModule, addr: number) {
  addr = addr >>> 0;
  const m = module.getMemory();
  let i = addr;
  for (; m[i] !== 0; ++i);
  return Buffer.from(m.slice(addr, i)).toString('ascii');
}

function transferToHeap(module: WasmModule, arr: Uint8Array, offset: number) {
  const mem = module.getMemory();
  for (let i = 0; i < arr.length; i++) {
    mem[i + offset] = arr[i];
  }
}

// For serializing numbers to 32 bit little-endian form.
function numToUInt32LE(n: number, bufferSize = 4) {
  const buf = Buffer.alloc(bufferSize);
  buf.writeUInt32LE(n, bufferSize - 4);
  return buf;
}

describe('barretenberg wasm', () => {
  let wasm!: WasmModule;
  let asyncCallState!: AsyncCallState;
  const store = isNode ? new NodeDataStore() : new WebDataStore();

  beforeAll(async () => {
    asyncCallState = new AsyncCallState();
    // Note: we duplicate some barretenberg code here for testing simplicity purposes
    wasm = new WasmModule(await fetchCode(), module => ({
      logstr(addr: number) {},
      /**
       * Read the data associated with the key located at keyAddr.
       * Malloc data within the WASM, copy the data into the WASM, and return the address to the caller.
       * The caller is responsible for taking ownership of (and freeing) the memory at the returned address.
       */
      // eslint-disable-next-line camelcase
      get_data: asyncCallState.wrapImportFn((state: AsyncFnState, keyAddr: number, lengthOutAddr: number) => {
        const key = stringFromAddress(wasm, keyAddr);
        if (!state.continuation) {
          // We are in the initial code path. Start the async fetch of data, return the promise.
          return store.get(key);
        } else {
          const data = state.result as Buffer | undefined;
          if (!data) {
            transferToHeap(wasm, numToUInt32LE(0), lengthOutAddr);
            return 0;
          }
          const dataAddr = wasm.call('bbmalloc', data.length);
          transferToHeap(wasm, numToUInt32LE(data.length), lengthOutAddr);
          transferToHeap(wasm, data, dataAddr);
          return dataAddr;
        }
      }),
      // eslint-disable-next-line camelcase
      set_data: asyncCallState.wrapImportFn(
        (state: AsyncFnState, keyAddr: number, dataAddr: number, dataLength: number) => {
          if (!state.continuation) {
            const key = stringFromAddress(wasm, keyAddr);
            return store.set(key, Buffer.from(wasm.sliceMemory(dataAddr, dataAddr + dataLength)));
          }
        },
      ),
      memory: module.getRawMemory(),
    }));
    await wasm.init();
    asyncCallState.init(wasm);
  });

  it('should new malloc, transfer and slice mem', () => {
    const length = 1024;
    const ptr = wasm.call('bbmalloc', length);
    const buf = Buffer.alloc(length, 128);
    wasm.transferToHeap(buf, ptr);
    wasm.call('bbfree', ptr);
    const result = Buffer.from(wasm.sliceMemory(ptr, ptr + length));
    expect(result).toStrictEqual(buf);
  });

  it('should use asyncify to do an async callback into js', async () => {
    const addr1 = await asyncCallState.call('test_async_func', 1024 * 1024, 1);
    const addr2 = await asyncCallState.call('test_async_func', 1024 * 1024 * 2, 2);
    expect(wasm.sliceMemory(addr1, addr1 + 1024 * 1024).every(v => v === 1)).toBe(true);
    expect(wasm.sliceMemory(addr2, addr2 + 1024 * 1024 * 2).every(v => v === 2)).toBe(true);
  });
});
