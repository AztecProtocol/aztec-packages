import { AsyncCallState, AsyncFnState, WasmModule, WasmWrapper } from '@aztec/foundation/wasm';

/**
 * A low-level wrapper for an instance of a WASM that uses AsyncCallState
 * to support awaitable calls from wasm to ts.
 */
export abstract class AsyncWasmWrapper extends WasmWrapper {
  protected asyncCallState = new AsyncCallState();

  /**
   * 30 pages by default. 30*2**16 \> 1mb stack size plus other overheads.
   * 8192 maximum by default. 512mb.
   * @param initial - Initial memory pages.
   * @param maximum - Max memory pages.
   * @returns The wrapper.
   */
  public async init(initial = 30, maximum = 8192): Promise<this> {
    await super.init(initial, maximum);
    this.asyncCallState.init(this.wasm);
    return this;
  }

  /**
   * These are functions implementations for imports we've defined are needed.
   * The native C++ build defines these in a module called "env". We must implement TypeScript versions here.
   * @param wasm - The wasm module.
   * @returns An object of functions called from cpp that need to be answered by ts.
   */
  protected getImportFns(): any {
    return {
      // eslint-disable-next-line camelcase
      set_data: () => {},
      // eslint-disable-next-line camelcase
      get_data: () => {},
    };
  }

  /**
   * Wrap an async import funtion.
   * @param fn - The function.
   * @returns The AsyncCallState-adapted function.
   */
  protected wrapAsyncImportFn(fn: (...args: number[]) => Promise<number | void>) {
    return this.asyncCallState.wrapImportFn((state: AsyncFnState, ...args: number[]) => {
      if (!state.continuation) {
        return fn(...args);
      }
      return state.result;
    });
  }

  /**
   * Uses asyncify to enable async callbacks into js.
   * @see https://kripken.github.io/blog/wasm/2019/07/16/asyncify.html
   * @param name - The method name.
   * @param args - The arguments to the method.
   * @returns The numeric integer or address result.
   */
  public async asyncCall(name: string, ...args: any): Promise<number> {
    return await this.asyncCallState.call(name, ...args);
  }
}

/**
 * Convert a number to a little-endian uint32 buffer.
 * @param n - The number to convert.
 * @param bufferSize - Size of the returned buffer.
 * @returns Resulting buffer.
 * TODO: REFACTOR: Copied from bb serialize, move to a set of serialization fns here in foundation.
 */
function numToUInt32LE(n: number, bufferSize = 4) {
  const buf = Buffer.alloc(bufferSize);
  buf.writeUInt32LE(n, bufferSize - 4);
  return buf;
}
