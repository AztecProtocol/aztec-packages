// A minimal test runner for test/hermes_host.cpp, which has print() and exit() but no test framework.
const tests = [];

export function test(name, fn) {
  tests.push([name, fn]);
}

export function equal(actual, expected, what) {
  const a = JSON.stringify(plain(actual));
  const e = JSON.stringify(plain(expected));
  if (a !== e) throw new Error(`${what}: expected ${clip(e)}, got ${clip(a)}`);
}

export function assert(condition, what) {
  if (!condition) throw new Error(what);
}

export async function rejects(fn, pattern, what) {
  let message;
  try {
    await fn();
  } catch (e) {
    message = e.message;
  }
  if (message === undefined) throw new Error(`${what}: did not throw`);
  if (!pattern.test(message)) throw new Error(`${what}: threw ${message}`);
}

// Typed arrays (Buffers among them, whose toJSON JSON.stringify would call), Maps and Sets as arrays.
function plain(value) {
  if (value instanceof Map) return [...value.entries()].map(plain);
  if (value instanceof Set) return [...value].map(plain);
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (Array.isArray(value)) return value.map(plain);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

const clip = text => (text.length > 200 ? `${text.slice(0, 200)}...` : text);

export function run() {
  (async () => {
    let failed = 0;
    for (const [name, fn] of tests) {
      try {
        await fn();
        print('ok  ', name);
      } catch (e) {
        failed++;
        print('FAIL', name, e.message, e.stack);
      }
    }
    print(`${tests.length - failed}/${tests.length} passed`);
    exit(failed ? 1 : 0);
  })();
}
