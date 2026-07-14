/**
 * Post-build size guard. Catches unintended bundle growth without involving CI separately.
 *
 * Each entry pairs a regex against the output path with a `maxKB` cap and a `description` that
 * shows up in the failure message. The build fails (exit 1) if any matching file exceeds its
 * cap, or if the total bundle size exceeds `totalLimitMiB`.
 *
 * When a legitimate change pushes a chunk over its limit, raise the number AND append a one-line
 * entry to the bump log so the history of size bumps stays auditable.
 */

// Bump log:
// - 2026-05-27: initial limits.
<<<<<<< HEAD
// - 2026-07-13: bumped total to 14.5 MiB.
=======
// - 2026-07-08: total 14 -> 15 MiB. Merging public-v5-next into v5-next pulled in the interactive-handshake
//   support (recipient- and sender-side) and the enlarged HandshakeRegistry contract chunk, pushing the TXE
//   bundle to ~14.01 MiB. No individual chunk exceeded its cap.
>>>>>>> origin/v5
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

<<<<<<< HEAD
export const totalLimitMiB = 14.5;
=======
export const totalLimitMiB = 15;
>>>>>>> origin/v5

/**
 * Validates a built esbuild `metafile` against the configured limits. Logs all violations then
 * calls `process.exit(1)` if any were found.
 */
export function enforceSizeLimits(metafile) {
  const violations = [];
  let totalBytes = 0;
  for (const [outPath, out] of Object.entries(metafile.outputs)) {
    totalBytes += out.bytes;
    for (const limit of sizeLimits) {
      if (limit.pattern.test(outPath)) {
        const sizeKB = out.bytes / 1024;
        if (sizeKB > limit.maxKB) {
          violations.push(`  ${outPath}: ${sizeKB.toFixed(1)} KB > ${limit.maxKB} KB (${limit.description})`);
        }
      }
    }
  }
  const totalMiB = totalBytes / 1024 / 1024;
  if (totalMiB > totalLimitMiB) {
    violations.push(`  total: ${totalMiB.toFixed(2)} MiB > ${totalLimitMiB} MiB`);
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
