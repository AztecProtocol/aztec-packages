/** Yields to the macrotask queue, draining all pending microtasks in between. */
export const tick = () => new Promise<void>(resolve => setImmediate(resolve));
