/**
 * Console.info interception — MUST be imported before any module that creates
 * pino loggers (e.g. @aztec/pxe).
 *
 * Pino's browser transport captures `console.info` at logger-creation time.
 * If our override runs after pino grabs the reference, pino bypasses it.
 * By isolating the override in its own module and importing it first,
 * ES module execution order guarantees it runs before any other dependency.
 */

const callbacks: Array<(args: any[]) => void> = [];

const originalInfo = console.info.bind(console);
console.info = (...args: any[]) => {
  originalInfo(...args);
  for (const cb of callbacks) {
    cb(args);
  }
};

/** Register a callback invoked on every console.info call. */
export function onConsoleInfo(cb: (args: any[]) => void): void {
  callbacks.push(cb);
}
