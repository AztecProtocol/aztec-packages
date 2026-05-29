/**
 * Rewrites EAGER protocol-contract barrel imports (`class-registry`, `instance-registry`) to
 * their `/lazy` siblings. The archiver, simulator, and aztec-node import these subpaths only
 * for event classes (`ContractClassPublishedEvent`, `ContractInstancePublishedEvent`, …) which
 * the `/lazy` barrel also re-exports — but the eager barrel statically pulls in the artifact
 * JSONs at module init. Routing through `/lazy` keeps each artifact in its own per-contract
 * dynamic chunk, loaded only when warmUp() runs.
 *
 * `fee-juice/index.js` is intentionally NOT rewritten: the eager barrel exposes synchronous
 * utilities (`computeFeePayerBalanceStorageSlot`) the simulator calls on every public tx, and
 * those need `storageLayout.balances.slot` from the loaded artifact.
 *
 * Two filters handle the two specifier forms seen by esbuild:
 *   - `@aztec/protocol-contracts/class-registry` — the package subpath, before esbuild does
 *     package.json `exports` resolution. We delegate back to esbuild via `build.resolve()` with
 *     `/lazy` appended so it picks the right per-package file.
 *   - `.../protocol-contracts/(dest|src)/(class|instance)-registry/index.(js|ts)` — the
 *     relative-path form after resolution, swapped to `lazy.(js|ts)` in place.
 */
export const protocolContractsEagerToLazyPlugin = {
  name: 'protocol-contracts-event-subpath-stub',
  setup(build) {
    build.onResolve({ filter: /^@aztec\/protocol-contracts\/(class-registry|instance-registry)$/ }, async args => {
      const result = await build.resolve(`${args.path}/lazy`, {
        kind: args.kind,
        importer: args.importer,
        resolveDir: args.resolveDir,
        pluginData: args.pluginData,
      });
      return result.errors.length ? null : { path: result.path };
    });
    build.onResolve(
      { filter: /protocol-contracts\/(dest|src)\/(class-registry|instance-registry)\/index\.(js|ts)$/ },
      args => {
        if (args.path.endsWith('/lazy.js') || args.path.endsWith('/lazy.ts')) {
          return null;
        }
        return { path: args.path.replace(/\/index\.(js|ts)$/, '/lazy.$1') };
      },
    );
  },
};
