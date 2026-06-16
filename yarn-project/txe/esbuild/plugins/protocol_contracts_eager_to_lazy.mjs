/**
 * Rewrites EAGER contract-artifact barrel imports to their `/lazy` siblings so each artifact JSON
 * stays in its own per-contract dynamic chunk (loaded only when warmUp() runs) instead of being
 * statically inlined into the worker's startup chunk.
 *
 * Two families are rewritten:
 *   - protocol-contracts `class-registry` / `instance-registry`: the archiver, simulator, and
 *     aztec-node import these subpaths only for event classes (`ContractClassPublishedEvent`,
 *     `ContractInstancePublishedEvent`, …) which the `/lazy` barrel also re-exports.
 *   - standard-contracts `auth-registry` / `handshake-registry` / `multi-call-entrypoint`: pulled
 *     in eagerly by `@aztec/pxe/server` (node entrypoint), which calls only the async
 *     `getStandard*()` getters — those exist identically on the `/lazy` barrels.
 *
 * `fee-juice/index.js` is intentionally NOT rewritten: the eager barrel exposes synchronous
 * utilities (`computeFeePayerBalanceStorageSlot`) the simulator calls on every public tx, and
 * those need `storageLayout.balances.slot` from the loaded artifact. The standard-contracts
 * `*Artifact` eager consts are likewise only imported by `@aztec/p2p` / `@aztec/aztec`, which are
 * stubbed or absent in the TXE bundle, so rewriting their barrels here is safe.
 *
 * Two filters per family handle the two specifier forms seen by esbuild:
 *   - the package subpath (e.g. `@aztec/protocol-contracts/class-registry`), before esbuild does
 *     package.json `exports` resolution. We delegate back to esbuild via `build.resolve()` with
 *     `/lazy` appended so it picks the right per-package file.
 *   - the relative-path form after resolution (e.g.
 *     `.../protocol-contracts/(dest|src)/class-registry/index.(js|ts)`), swapped to `lazy.(js|ts)`
 *     in place.
 */
const eagerBarrels = [
  { pkg: 'protocol-contracts', subpaths: ['class-registry', 'instance-registry'] },
  { pkg: 'standard-contracts', subpaths: ['auth-registry', 'handshake-registry', 'multi-call-entrypoint'] },
];

export const protocolContractsEagerToLazyPlugin = {
  name: 'eager-artifact-barrels-to-lazy',
  setup(build) {
    for (const { pkg, subpaths } of eagerBarrels) {
      const alt = subpaths.join('|');
      const bareSpecifier = new RegExp(`^@aztec\\/${pkg}\\/(${alt})$`);
      const resolvedPath = new RegExp(`${pkg}\\/(dest|src)\\/(${alt})\\/index\\.(js|ts)$`);

      build.onResolve({ filter: bareSpecifier }, async args => {
        const result = await build.resolve(`${args.path}/lazy`, {
          kind: args.kind,
          importer: args.importer,
          resolveDir: args.resolveDir,
          pluginData: args.pluginData,
        });
        return result.errors.length ? null : { path: result.path };
      });
      build.onResolve({ filter: resolvedPath }, args => {
        if (args.path.endsWith('/lazy.js') || args.path.endsWith('/lazy.ts')) {
          return null;
        }
        return { path: args.path.replace(/\/index\.(js|ts)$/, '/lazy.$1') };
      });
    }
  },
};
