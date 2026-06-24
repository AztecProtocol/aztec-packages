// Thin wrapper around the Android Debug Bridge for the multi-device WebGPU bench.
//
// The phones are physically attached to the *Mac*, so the adb server (which owns
// the USB transports) runs there. This box reaches it over an SSH reverse tunnel
// the Mac opens — `ssh -R 5037:localhost:5037 <box>` — exactly mirroring the 9222
// CDP tunnel. Every call here is addressed with explicit `-H/-P` so it talks to
// that tunneled server and never forks a local one (a local server would see zero
// devices). See scripts/SETUP.md.
//
// Defaults: ADB_HOST=127.0.0.1, ADB_PORT=5037, ADB_BIN=adb. Override via env.
import { execFile } from 'node:child_process';

const ADB_BIN = process.env.ADB_BIN || 'adb';
const ADB_HOST = process.env.ADB_HOST || '127.0.0.1';
const ADB_PORT = process.env.ADB_PORT || '5037';

// `127.0.0.1` (IPv4) on purpose — an SSH `-R` forward binds IPv4, and `localhost`
// can resolve to `::1` first and fail to connect (same gotcha as the CDP driver).
const HOSTPORT = ['-H', ADB_HOST, '-P', ADB_PORT];

/** Run an adb invocation against the tunneled server; resolves trimmed stdout. */
function adb(args, { timeoutMs = 20_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(ADB_BIN, [...HOSTPORT, ...args], { timeout: timeoutMs, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) {
        const detail = (stderr || stdout || err.message || '').trim();
        reject(new Error(`adb ${args.join(' ')} failed: ${detail}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/** Per-device adb call (`adb -s <serial> ...`). */
function adbDev(serial, args, opts) {
  return adb(['-s', serial, ...args], opts);
}

/**
 * One connected Android device as reported by `adb devices -l`, enriched with the
 * marketing name and Android SDK level so the registry can label it nicely.
 */
export async function listDevices() {
  const raw = await adb(['devices', '-l']);
  const lines = raw.split('\n').slice(1); // drop the "List of devices attached" header
  const devices = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [serial, state, ...rest] = trimmed.split(/\s+/);
    const kv = Object.fromEntries(rest.map(tok => tok.split(':')).filter(p => p.length === 2));
    devices.push({ serial, state, model: kv.model, device: kv.device, transportId: kv.transport_id });
  }
  // Enrich `device` (state === 'device') entries with human-friendly props. Skip
  // `unauthorized` / `offline` — getprop would just hang or error on those.
  for (const d of devices) {
    if (d.state !== 'device') continue;
    try {
      const market = await prop(d.serial, 'ro.product.marketname');
      const model = await prop(d.serial, 'ro.product.model');
      const sdk = await prop(d.serial, 'ro.build.version.sdk');
      d.marketName = market || model || d.model;
      d.modelName = model || d.model;
      d.sdk = sdk ? parseInt(sdk, 10) : undefined;
    } catch {
      d.marketName = d.model;
    }
  }
  return devices;
}

/** Read a single system property (`getprop <key>`). */
export async function prop(serial, key) {
  return (await adbDev(serial, ['shell', 'getprop', key])).trim();
}

/**
 * Forward the device's localhost:<port> back to the adb-server host (the Mac),
 * which in turn forwards it to this box via the Mac's `ssh -L <port>`. After this,
 * the phone can load `http://localhost:<port>/...` and hit this box's dev server.
 */
export async function reverse(serial, port) {
  return adbDev(serial, ['reverse', `tcp:${port}`, `tcp:${port}`]);
}

/** Drop all reverse forwards for a device (cleanup between/after runs). */
export async function removeAllReverse(serial) {
  return adbDev(serial, ['reverse', '--remove-all']).catch(() => {});
}

/** Wake the screen (a sleeping device renders nothing and throttles WebGPU). */
export async function wake(serial) {
  return adbDev(serial, ['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']).catch(() => {});
}

/** Keep the screen awake while charging (the Developer-option "Stay awake"), so the
 *  USB/adb link doesn't drop when the screen sleeps between runs. Persists until reset. */
export async function stayAwake(serial, on) {
  return adbDev(serial, ['shell', 'settings', 'put', 'global', 'stay_on_while_plugged_in', on ? '3' : '0']).catch(
    () => {},
  );
}

/** Force-stop a package — used to clear Chrome's tabs/GPU pool between runs. */
export async function forceStop(serial, pkg = 'com.android.chrome') {
  return adbDev(serial, ['shell', 'am', 'force-stop', pkg]).catch(() => {});
}

/**
 * Open a URL in Chrome via an explicit VIEW intent. The whole `am start ...`
 * command is sent as ONE remote-shell string with the URL single-quoted, so the
 * device shell doesn't split the query string on its `&` separators.
 */
export async function launchChrome(serial, url, pkg = 'com.android.chrome') {
  const cmd = `am start -a android.intent.action.VIEW -d '${url}' ${pkg}`;
  return adbDev(serial, ['shell', cmd], { timeoutMs: 30_000 });
}

/** Best-effort connectivity check against the tunneled server. Throws if unreachable. */
export async function assertServerReachable() {
  await adb(['version']);
}

export { ADB_HOST, ADB_PORT };
