// Tiny runtime assert. Used in place of Node's `assert` built-in so
// this module can run unchanged in the browser bundle. The MSM port
// only ever calls `assert(cond)` and `assert(cond, msg)` — the
// equality-helper surface of Node's assert isn't used here.
export function assert(condition: unknown, message?: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed${message ? `: ${message}` : ""}`);
  }
}
