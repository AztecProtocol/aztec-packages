/**
 * Post-build size guard. Catches unintended bundle growth without involving CI separately.
 *
 * Each entry in `sizeLimits` pairs a regex against the output path with a `maxKB` cap and a
 * `description` that shows up in the failure message. The build fails (exit 1) if any matching
 * file exceeds its cap, if the total runtime JS exceeds `totalLimitMiB`, or if the total external
 * sourcemap size exceeds `sourcemapLimitMiB`.
 *
 * The JS total and the sourcemap total are tracked separately. `sourcemap: 'external'` in
 * esbuild.config.mjs keeps the `.map` files out of the runtime parse path (V8 only parses the
 * `.js`; Node loads a `.map` lazily for stack traces), so folding them into the runtime-bundle
 * number would measure the wrong thing — sourcemaps are ~2x the JS here. The sourcemap cap exists
 * only to notice runaway map growth, so it is deliberately loose.
 *
 * When a legitimate change pushes a chunk or total over its limit, raise the number AND append a
 * one-line entry to the bump log so the history of size bumps stays auditable.
 */

// Bump log:
// - 2026-05-27: initial limits.
// - 2026-07-08: total 14 -> 15 MiB. Merging public-v5-next into v5-next pulled in the interactive-handshake
//   support (recipient- and sender-side) and the enlarged HandshakeRegistry contract chunk, pushing the TXE
//   bundle to ~14.01 MiB. No individual chunk exceeded its cap. (Total counted JS + sourcemaps back then.)
// - 2026-07-13: bumped total to 14.5 MiB (stopgap; total still counted JS + sourcemaps).
// - 2026-07-20: total now counts runtime JS only, excluding external `.map` sourcemaps (~66% of the old
//   number). Reset to 6 MiB against ~4.74 MiB of JS today; reverts the 14.5 stopgap. Sourcemap total gets
//   its own loose cap (`sourcemapLimitMiB`, 12 MiB against ~9.3 MiB today) so map growth is still watched.
export const sizeLimits = [
  // Shared chunks emitted by code-splitting; carry the simulator + PXE + world-state graph.
  // Spikes here usually mean a heavy dep crept into the eager import path.
  { pattern: /^dest\/chunk-.*\.js$/, maxKB: 2200, description: 'split chunk' },
  // Per-protocol-contract artifact chunks (loaded lazily via LazyProtocolContractsProvider).
  { pattern: /^dest\/[A-Z][A-Za-z]+-[A-Z0-9]+\.js$/, maxKB: 800, description: 'contract artifact chunk' },
  // Tiny entry stubs that just re-export from the shared chunks.
  { pattern: /^dest\/(worker|server)\.bundle\.js$/, maxKB: 8, description: 'entrypoint stub' },
  { pattern: /^dest\/bin\/index\.js$/, maxKB: 8, description: 'CLI entrypoint stub' },
];

// Cap on the total runtime JS (`.js` outputs). This is what V8 parses at cold start.
export const totalLimitMiB = 6;

// Loose cap on the total external sourcemap size (`.map` outputs). Not on the runtime parse path;
// exists only to flag runaway growth.
export const sourcemapLimitMiB = 12;

/**
 * Validates a built esbuild `metafile` against the configured limits. Logs all violations then
 * calls `process.exit(1)` if any were found.
 */
export function enforceSizeLimits(metafile) {
  const violations = [];
  let totalJsBytes = 0;
  let totalMapBytes = 0;
  for (const [outPath, out] of Object.entries(metafile.outputs)) {
    if (outPath.endsWith('.map')) {
      totalMapBytes += out.bytes;
      continue;
    }
    totalJsBytes += out.bytes;
    for (const limit of sizeLimits) {
      if (limit.pattern.test(outPath)) {
        const sizeKB = out.bytes / 1024;
        if (sizeKB > limit.maxKB) {
          violations.push(`  ${outPath}: ${sizeKB.toFixed(1)} KB > ${limit.maxKB} KB (${limit.description})`);
        }
      }
    }
  }
  const totalJsMiB = totalJsBytes / 1024 / 1024;
  if (totalJsMiB > totalLimitMiB) {
    violations.push(`  runtime JS total: ${totalJsMiB.toFixed(2)} MiB > ${totalLimitMiB} MiB`);
  }
  const totalMapMiB = totalMapBytes / 1024 / 1024;
  if (totalMapMiB > sourcemapLimitMiB) {
    violations.push(`  sourcemap total: ${totalMapMiB.toFixed(2)} MiB > ${sourcemapLimitMiB} MiB`);
  }
  if (violations.length === 0) {
    return;
  }
  // eslint-disable-next-line no-console
  console.error('\nBundle size guard tripped:\n' + violations.join('\n'));
  // eslint-disable-next-line no-console
  console.error(
    '\nIf the new size is intentional, raise the corresponding limit in esbuild/size_guard.mjs and add a bump-log line.',
  );
  process.exit(1);
}
