/**
 * Clean shutdown property test.
 *
 * Spawns a child Node process that:
 *   1. Creates a Barretenberg instance with multiple worker threads.
 *   2. Submits enough work to ensure the pthread pool is warm.
 *   3. Calls `destroy()` on the instance.
 *   4. Returns from main and lets the runtime exit naturally.
 *
 * The historical bug class: under the previous wasm runtime, `destroy()`
 * left the pthread pool in a state that pinned the Node process open
 * forever. The test asserts the child exits within 5 seconds of returning
 * from main.
 */

import { spawn } from 'child_process';
import path from 'path';

// `barretenberg/ts/scripts/run_test.sh` cd's into `barretenberg/ts/` before
// invoking jest, so cwd is the package root regardless of where the compiled
// test file lives (`dest/node/...`). Resolving the harness off cwd keeps the
// path stable as we don't ship the harness source into `dest/`.
const PROJECT_ROOT = process.cwd();
const ENTRYPOINT = path.join(PROJECT_ROOT, 'src', 'barretenberg', 'clean_shutdown.harness.ts');

describe('Barretenberg clean shutdown', () => {
  it('exits within 5s of destroy()', async () => {
    const start = Date.now();

    const child = spawn(
      process.execPath,
      ['--no-warnings', '--experimental-vm-modules', '--loader', 'ts-node/esm', ENTRYPOINT],
      {
        cwd: PROJECT_ROOT,
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
        stdio: 'pipe',
      },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => (stdout += d.toString()));
    child.stderr.on('data', d => (stderr += d.toString()));

    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; ms: number }>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`harness did not exit within 30s. stdout: ${stdout} stderr: ${stderr}`));
      }, 30_000);
      child.on('exit', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal, ms: Date.now() - start });
      });
    });

    // The harness prints a "DESTROY_AT=<ms>" line right before destroy().
    // Anything after that is shutdown latency.
    const m = stdout.match(/DESTROY_AT=(\d+)/);
    expect(m).not.toBeNull();
    const destroyAt = m ? Number(m[1]) : 0;
    const shutdownMs = exit.ms - (destroyAt - start);

    expect(exit.signal).toBeNull();
    expect(exit.code).toBe(0);
    expect(shutdownMs).toBeLessThan(5_000);
  }, 60_000);
});
