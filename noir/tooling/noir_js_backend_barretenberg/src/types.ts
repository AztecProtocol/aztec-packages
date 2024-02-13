/**
 * @description
 * An options object, currently only used to specify the number of threads to use.
 */
export type BackendOptions = {
  /** @description Number of threads */
  threads: number;
  /** @description Maximum memory to be allocated to the WASM (optional) */
  memory?: { maximum: number };
};
