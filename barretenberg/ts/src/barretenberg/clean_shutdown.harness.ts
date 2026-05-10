/**
 * Child-process harness for the clean-shutdown test. Driven by
 * `clean_shutdown.test.ts` via `child_process.spawn`.
 *
 * Output contract: prints `DESTROY_AT=<ms-since-epoch>` immediately before
 * calling `destroy()`. The parent process measures the gap between that
 * line and process exit.
 *
 * The harness MUST dispatch real work onto the pthread pool before destroy
 * -- otherwise the post-destroy 5s budget is trivially passing because the
 * pool was never warmed. To genuinely keep multiple Workers busy at the
 * moment `destroy()` is called we issue many concurrent `srsInitSrs` calls
 * via `Promise.all`. `srsInitSrs` is the canonical bb.js path that uses
 * `parallel_for` internally (see `bbapi/bbapi_srs.cpp` -- three
 * `parallel_for` blocks over the points buffer), so each call genuinely
 * fans out across the pthread pool rather than serialising on the proxy
 * thread the way blake2s does.
 *
 * We also fire blake2s calls in parallel with the SRS calls so that, even
 * if a future bbapi refactor makes srsInitSrs serial, the pool is hit by
 * a second concurrent message-passing path while we tear down.
 *
 * After destroy() returns, we arm a 5s unref'd timer that calls
 * `process.exit(2)` if it fires. The unref means the timer does NOT keep
 * the event loop alive on its own -- natural exit (clean teardown of the
 * pthread pool) wins if it happens first. If the runtime hangs (pool not
 * torn down, leaked workers, etc.) the timer fires and the harness exits
 * non-zero, which the parent test asserts on.
 */

import { BackendType, Barretenberg } from './index.js';

// Each parallel_for-driven call must be large enough that the work splits
// across multiple worker threads (DEFAULT_MIN_ITERS_PER_THREAD = 16; with
// 4 threads we want >= 64 points). We use 4096 points (256 KiB at 64
// bytes/point) per srsInitSrs call so the work fans out reliably.
const POOL_WARM_POINTS_PER_CALL = 4096;
const POOL_WARM_PARALLEL_CALLS = 8;
const BLAKE_TICKLE_ITERATIONS = 32;
const POST_DESTROY_BUDGET_MS = 5_000;

const UNCOMPRESSED_POINT_BYTES = 64; // sizeof(g1::affine_element) == 64
const G2_POINT_BYTES = 128;

/**
 * Build a buffer of `count` infinity points in uncompressed form.
 *
 * `affine_element::serialize_from_buffer` (ecc/groups/affine_element.hpp)
 * detects "all bits set" as the point-at-infinity sentinel. Filling the
 * buffer with 0xFF therefore produces a valid (curve-membership-passing)
 * uncompressed BN254 G1 point buffer that drives the parallel_for
 * dispatch in `SrsInitSrs::execute` without requiring a real CRS file.
 */
function buildInfinityPointsBuffer(count: number, bytesPerPoint: number): Uint8Array {
  return new Uint8Array(count * bytesPerPoint).fill(0xff);
}

async function main() {
  const bb = await Barretenberg.new({
    backend: BackendType.Wasm,
    threads: 4,
    skipSrsInit: true,
    logger: () => {},
  });

  // Build the synthetic SRS payload once and reuse across the parallel
  // invocations. The buffer is filled with 0xFF so every 64-byte slice
  // decodes to the BN254 G1 point at infinity, which is curve-valid.
  const pointsBuf = buildInfinityPointsBuffer(POOL_WARM_POINTS_PER_CALL, UNCOMPRESSED_POINT_BYTES);
  const g2Point = new Uint8Array(G2_POINT_BYTES).fill(0xff);

  const blakeInputs = Array.from({ length: BLAKE_TICKLE_ITERATIONS }, (_, i) =>
    Buffer.from(`bb-clean-shutdown-tickle-${i}-${'x'.repeat(64)}`),
  );

  // Fire SRS init calls + blake2s calls concurrently. The SRS calls
  // genuinely fan out via parallel_for on the wasm side; the blake2s calls
  // saturate the proxy-thread message queue. Combined, every worker in
  // the pthread pool has executed at least one task before we measure
  // post-destroy shutdown latency.
  const work: Promise<unknown>[] = [];
  for (let i = 0; i < POOL_WARM_PARALLEL_CALLS; ++i) {
    work.push(
      bb.srsInitSrs({
        pointsBuf,
        numPoints: POOL_WARM_POINTS_PER_CALL,
        g2Point,
      }),
    );
  }
  for (const data of blakeInputs) {
    work.push(bb.blake2s({ data }));
  }
  await Promise.all(work);

  process.stdout.write(`DESTROY_AT=${Date.now()}\n`);
  await bb.destroy();

  // Race-against-natural-exit guard. setTimeout is unref'd so it does not
  // itself keep the event loop alive; if the pthread pool is properly torn
  // down there are no other handles and Node exits naturally before this
  // ever fires. If the runtime hangs (leaked workers, leftover I/O), the
  // timer is the fallback that produces a non-zero exit so the parent test
  // sees a real failure instead of timing out at the parent's outer guard.
  const failTimer = setTimeout(() => {
    process.stderr.write(`HARNESS_HANG_AFTER_DESTROY_${POST_DESTROY_BUDGET_MS}MS\n`);
    process.exit(2);
  }, POST_DESTROY_BUDGET_MS);
  failTimer.unref?.();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
