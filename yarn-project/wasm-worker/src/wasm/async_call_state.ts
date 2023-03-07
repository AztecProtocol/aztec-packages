export interface AsyncFnState {
  continuation: boolean;
  result?: any;
}

/**
 * To enable asynchronous callbacks from wasm to js, we leverage asyncify.
 * https://kripken.github.io/blog/wasm/2019/07/16/asyncify.html
 *
 * This class holds state and logic specific to handling async calls from wasm to js.
 * A single instance of this class is instantiated as part of BarretenbergWasm.
 * It allocates some memory for the asyncify stack data and initialises it.
 *
 * To make an async call into the wasm, just call `call` the same as in BarretenbergWasm, only it returns a promise.
 *
 * To make an async import that will be called from the wasm, wrap a function with the signature:
 *   my_func(state: AsyncFnState, ...args)
 * with a call to `wrapImportFn`.
 * The arguments are whatever the original call arguments were. The addition of AsyncFnState as the first argument
 * allows for the detection of wether the function is continuing after the the async call has completed.
 * If `state.continuation` is false, the function should start its async operation and return the promise.
 * If `state.continuation` is true, the function can get the result from `state.result` perform any finalisation,
 * and return an (optional) value to the wasm.
 */
export class AsyncCallState {
  private ASYNCIFY_DATA_SIZE = 16 * 1024;
  private asyncifyDataAddr!: number;
  private asyncPromise?: Promise<any>;
  public state?: AsyncFnState;
  private memory!: WebAssembly.Memory;
  private callExport!: (...args: any[]) => number;
  private debug = console.log;

  public init(memory: WebAssembly.Memory, callExport: (...args: any[]) => number, debug = console.log) {
    this.memory = memory;
    this.debug = debug;
    this.callExport = callExport;
    // Allocate memory for asyncify stack data.
    this.asyncifyDataAddr = this.callExport('bbmalloc', this.ASYNCIFY_DATA_SIZE);
    const view = new Uint32Array(this.memory.buffer);
    // First two integers of asyncify data, are the start and end of the stack region.
    view[this.asyncifyDataAddr >> 2] = this.asyncifyDataAddr + 8;
    view[(this.asyncifyDataAddr + 4) >> 2] = this.asyncifyDataAddr + this.ASYNCIFY_DATA_SIZE;
  }

  public destroy() {
    // Free call stack data.
    this.callExport('bbfree', this.asyncifyDataAddr);
  }

  /**
   * We call the wasm function, that will in turn call back into js via callImport and set this.asyncPromise and
   * enable the instrumented "record stack unwinding" code path.
   * Once the stack has unwound out of the wasm call, we enter into a loop of resolving the promise set in the call
   * to callImport, and calling back into the wasm to rewind the stack and continue execution.
   */
  public async call(name: string, ...args: any) {
    this.state = { continuation: false };
    let result = this.callExport(name, ...args);

    while (this.asyncPromise) {
      // Disable the instrumented "record stack unwinding" code path.
      this.callExport('asyncify_stop_unwind');
      this.debug('stack unwound.');
      // Wait for the async work to complete.
      this.state.result = await this.asyncPromise;
      this.state.continuation = true;
      this.debug('result set starting rewind.');
      // Enable "stack rewinding" code path.
      this.callExport('asyncify_start_rewind', this.asyncifyDataAddr);
      // Call function again to rebuild the stack, and continue where we left off.
      result = this.callExport(name, ...args);
    }

    // Cleanup
    this.state = undefined;

    return result;
  }

  public wrapImportFn(fn: (state: AsyncFnState, ...args: any[]) => any) {
    return (...args: any[]) => {
      if (!this.asyncPromise) {
        // We are in the normal code path. Start the async fetch of data.
        this.asyncPromise = fn(this.state!, ...args);
        // Enable "record stack unwinding" code path and return.
        this.callExport('asyncify_start_unwind', this.asyncifyDataAddr);
      } else {
        // We are in the stack rewind code path, called once the promise is resolved.
        // Save the result data back to the wasm, disable stack rewind code paths, and return.
        this.callExport('asyncify_stop_rewind');
        const result = fn(this.state!, ...args);
        // Cleanup.
        this.asyncPromise = undefined;
        this.state = { continuation: false };
        return result;
      }
    };
  }
}
