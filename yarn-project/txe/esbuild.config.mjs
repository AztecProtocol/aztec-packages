// Bundles the TXE entry points (bin/index.ts + worker.ts) into single files so each Node isolate
// — main thread and worker_threads alike — compiles one file at startup instead of resolving the
// full TXE → simulator → world-state → bb-prover dependency tree from scratch. This is the
// dominant cost of cold-starting TXE.
//
// Native modules (LMDB, @aztec/native, msgpackr, snappy, etc.) and packages that load their own
// .wasm assets at runtime (@aztec/noir-acvm_js, @aztec/noir-noirc_abi, @aztec/bb.js) stay
// external — esbuild cannot bundle .node binaries, and bundling the WASM-loader JS would break
// relative paths to the .wasm files.
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
// Dump the full metafile so we can audit chunk graph / imports separately from the build.
import { writeFile as writeFile_ } from 'node:fs/promises';

/**
 * Auto-externalizes any module whose resolved path is a .node native binding. Catches both
 * direct `.node` imports and bare specifiers whose package main field points at a .node binary
 * (e.g. `@napi-rs/snappy-linux-x64-gnu`).
 */
const externalNativePlugin = {
  name: 'external-native',
  setup(build) {
    build.onResolve({ filter: /\.node$/ }, args => ({ path: args.path, external: true }));
  },
};

/**
 * `@aztec/*` packages that AztecNodeService imports transitively but the TXE worker never
 * actually constructs or executes. We pass our own implementations (DummyP2P, TXEArchiver,
 * MockEpochCache, TestCircuitVerifier) and `undefined` for sequencer/validator/prover, so the
 * symbols imported from these packages are only used inside AztecNodeService methods that TXE
 * never calls. The stub Proxy throws on actual invocation, which surfaces any false assumption
 * loudly instead of letting it through as `undefined`.
 */
const stubbedAztecPackages = [
  // NOTE: `@aztec/archiver` is intentionally NOT stubbed — TXEArchiver extends ArchiverDataSourceBase
  // and uses createArchiverDataStores at runtime.
  '@aztec/p2p',
  '@aztec/sequencer-client',
  '@aztec/validator-client',
  '@aztec/prover-client',
  '@aztec/prover-node',
  '@aztec/slasher',
  '@aztec/epoch-cache',
  '@aztec/blob-client',
  // NOTE: `@aztec/blob-lib` is NOT stubbed — stdlib's tx_effect calls getNumTxBlobFields at
  // runtime when serializing transactions.
  '@aztec/node-keystore',
  '@aztec/node-lib',
];
const stubAztecPlugin = {
  name: 'stub-aztec-packages',
  setup(build) {
    const stubPath = new URL('./src/stubs/empty_stub.cjs', import.meta.url).pathname;
    const filter = new RegExp(`^(${stubbedAztecPackages.map(p => p.replace(/[/-]/g, '[\\/\\-]')).join('|')})(/.*)?$`);
    build.onResolve({ filter }, () => ({ path: stubPath }));
  },
};

/**
 * Strips `file_map` and per-function `debug_symbols` from bundled contract artifact JSON files.
 * Roughly 75% of each compiled artifact is sourcemaps / file maps used only by
 * `getFunctionDebugMetadata` for error-trace enrichment — `loadContractArtifact` already tolerates
 * empty values (callers gate on truthiness and return `undefined`), so stripping these is safe for
 * TXE which never decodes private-function failure traces against the bundled protocol contracts
 * or the SchnorrAccount artifact.
 *
 * Affects only the artifacts inlined into the bundle (protocol-contracts + SchnorrAccount).
 * User contracts loaded at runtime from disk in `#processDeployInputs` keep their full metadata.
 */
const stripArtifactDebugPlugin = {
  name: 'strip-artifact-debug',
  setup(build) {
    build.onLoad({ filter: /(protocol-contracts\/artifacts|accounts\/artifacts).*\.json$/ }, async args => {
      const raw = await readFile(args.path, 'utf-8');
      const json = JSON.parse(raw);
      // `ContractArtifactSchema` (yarn-project/stdlib/src/abi/abi.ts) requires `fileMap` to be a
      // record and `debugSymbols` to be a string, so we zero them out instead of deleting them.
      // Empty values are tolerated by `getFunctionDebugMetadata`, which returns `undefined`.
      json.file_map = {};
      if (Array.isArray(json.functions)) {
        for (const fn of json.functions) {
          fn.debug_symbols = '';
        }
      }
      return { contents: JSON.stringify(json), loader: 'json' };
    });
  },
};

const entryPoints = {
  // src/bin/index.ts → dest/bin/index.js (overwrites the tsc-emitted file).
  'bin/index': 'src/bin/index.ts',
  // src/worker.ts → dest/worker.bundle.js (the file the pool spawns).
  'worker.bundle': 'src/worker.ts',
  // src/rpc_server.ts → dest/server.bundle.js (the entry the parent `@aztec/aztec`
  // CLI imports via `@aztec/txe/server`). Bundled so the published tarball can ship
  // only the bundle outputs and not the tsc-emitted unbundled tree.
  'server.bundle': 'src/rpc_server.ts',
};

const start = Date.now();
const result = await build({
  entryPoints,
  outdir: 'dest',
  entryNames: '[dir]/[name]',
  bundle: true,
  platform: 'node',
  format: 'esm',
  // Splitting lets `LazyProtocolContractsProvider`'s per-contract `await import(...)` calls
  // resolve into separate chunks loaded only when warmUp() runs. Without splitting, esbuild
  // inlines dynamic imports back into the parent bundle and the artifacts are eager again.
  splitting: true,
  target: 'node20',
  external: [
    // `pako` is used only by `parseDebugSymbols` in stdlib/abi/abi.ts. We strip `debug_symbols`
    // at bundle time, so `getFunctionDebugMetadata` always short-circuits before reaching
    // parseDebugSymbols — pako never executes. Externalizing keeps the 70 KiB inflate impl out
    // of the eager startup chunk; if it ever IS reached, Node will resolve it from node_modules.
    'pako',
    // Native-wrapper JS packages. Bundling these would either pull in their .node files (which
    // can't be loaded by esbuild) or strand them from their per-arch native dependencies.
    'lmdb',
    'msgpackr',
    'msgpackr-extract',
    'snappy',
    'node-eth-kzg',
    '@aztec/native',
    // WASM-loading packages.
    '@aztec/noir-acvm_js',
    '@aztec/noir-noirc_abi',
    // bb.js loads barretenberg-threads.wasm.gz via a path computed relative to its own module
    // location — bundling moves the JS but not the .wasm.gz, breaking the load.
    '@aztec/bb.js',
    // Artifacts the TXE worker never executes (rollup, parity, kernel circuits,
    // VKs). They ship as multi-MB JSON files and get re-exported from a barrel without proper
    // sideEffects: false, so esbuild can't tree-shake them. Externalizing the whole package
    // keeps them off the worker's startup parse path.
    '@aztec/noir-protocol-circuits-types',
    '@aztec/noir-protocol-circuits-types/client',
    '@aztec/noir-protocol-circuits-types/server',
    '@aztec/noir-protocol-circuits-types/vks',
    // pino spawns its own worker_threads for transports and detects its runtime format
    // dynamically; bundling it triggers ERR_AMBIGUOUS_MODULE_SYNTAX. thread-stream and
    // sonic-boom are pino's siblings and have the same issue.
    'pino',
    'pino-pretty',
    'pino-abstract-transport',
    'thread-stream',
    'sonic-boom',
    // bcrypto detects native vs js bindings at load time the same way pino does; bundling
    // triggers ERR_AMBIGUOUS_MODULE_SYNTAX.
    'bcrypto',
    // TXE never talks to L1, so the whole ethereum/viem stack is dead weight in the worker.
    // Keeping it external avoids bundling forwarder_proxy (whose CLI guard executes when
    // bundled), viem, abitype, and the rest of the L1 client surface.
    '@aztec/ethereum',
    '@aztec/l1-artifacts',
    // Same reasoning: stdlib/p2p/signature_utils, archiver/l1, and aztec-node/config all
    // statically import `viem` for L1 RPC + signing primitives. None of those code paths
    // execute in TXE, so externalize the whole tree (saves ~317 KiB of eager bundle).
    'viem',
    'abitype',
    'ox',
    // TXE never snapshots/uploads world state, so the file-store backend (which drags in the
    // AWS S3 SDK, Google Cloud Storage SDK, mime-db, pako, etc.) is dead weight.
    '@aztec/stdlib/file-store',
    '@aztec/stdlib/snapshots',
  ],
  plugins: [
    externalNativePlugin,
    stubAztecPlugin,
    stripArtifactDebugPlugin,
    // Replace the heavy `@aztec/telemetry-client` barrel (which transitively pulls in
    // koa-router, raw-body, iconv-lite, mime-db, prom-client) with a TXE-local stub. The plugin
    // matches *only* the exact specifier, leaving sub-imports like `/start` or `/config` alone
    // (which esbuild's prefix-based `alias` field cannot do).
    {
      name: 'telemetry-stub',
      setup(build) {
        const stubPath = new URL('./src/stubs/telemetry_stub.ts', import.meta.url).pathname;
        build.onResolve({ filter: /^@aztec\/telemetry-client$/ }, () => ({ path: stubPath }));
      },
    },
    // Redirect protocol-contracts EAGER subpath barrels for class-registry and instance-registry
    // to their `/lazy` equivalents. archiver and simulator import these subpaths only to get the
    // event classes (`ContractClassPublishedEvent`, `ContractInstancePublishedEvent`, etc.) which
    // `/lazy` also re-exports — but the eager barrel statically pulls in the multi-hundred-KiB
    // artifact JSONs at module init. Redirecting to /lazy keeps the artifacts in their own
    // per-contract dynamic chunks.
    //
    // The redirect handles both the package-subpath specifier (`@aztec/protocol-contracts/
    // class-registry`, what source code writes) and the post-resolution path (`.../dest/class-
    // registry/index.js`, what bundle.js's static `import './class-registry/index.js'` produces
    // after package-export resolution). Matching only the resolved form would miss the subpath
    // imports — esbuild calls `onResolve` with the original specifier from the source.
    //
    // fee-juice/index.js is NOT redirected because the eager barrel exposes synchronous utility
    // functions (`computeFeePayerBalanceStorageSlot`) that simulator/public_processor calls on
    // every public tx and that need `storageLayout.balances.slot` from the loaded artifact.
    {
      name: 'protocol-contracts-event-subpath-stub',
      setup(build) {
        // Match: `@aztec/protocol-contracts/class-registry` (and instance-registry) — the package
        // subpath form, before esbuild does package.json export resolution. Re-resolve through
        // the package's exports map (which has a `*/lazy` entry) so esbuild does the heavy
        // lifting of finding the actual file.
        build.onResolve({ filter: /^@aztec\/protocol-contracts\/(class-registry|instance-registry)$/ }, async args => {
          const result = await build.resolve(`${args.path}/lazy`, {
            kind: args.kind,
            importer: args.importer,
            resolveDir: args.resolveDir,
            pluginData: args.pluginData,
          });
          return result.errors.length ? null : { path: result.path };
        });
        // Match: `.../protocol-contracts/(dest|src)/(class-registry|instance-registry)/index.(js|ts)`
        // — the relative form, used by `bundle.js` after package resolution.
        build.onResolve(
          { filter: /protocol-contracts\/(dest|src)\/(class-registry|instance-registry)\/index\.(js|ts)$/ },
          args => {
            if (args.path.endsWith('/lazy.js') || args.path.endsWith('/lazy.ts')) return null;
            return { path: args.path.replace(/\/index\.(js|ts)$/, '/lazy.$1') };
          },
        );
      },
    },
    // Redirect `@aztec/protocol-contracts/providers/bundle` to a stub that re-exports the
    // LAZY provider class under the `BundledProtocolContractsProvider` name. Several non-TXE
    // workspace packages (pxe/server/utils, archiver/factory) statically import the bundled
    // provider as a default, which pulls every protocol-contract artifact JSON into the worker
    // startup chunk. The lazy provider has the same interface; substituting it here moves the
    // artifacts back into their per-contract dynamic chunks without touching the workspace
    // source.
    //
    // Two filters: the package-specifier form (`@aztec/protocol-contracts/providers/bundle` —
    // what source code writes) and the resolved-path form (`.../dest/provider/bundle.js`, just
    // in case some transitive caller hits the resolved path).
    {
      name: 'protocol-contracts-bundle-stub',
      setup(build) {
        const stubPath = new URL('./src/stubs/protocol_contracts_bundle_stub.ts', import.meta.url).pathname;
        build.onResolve({ filter: /^@aztec\/protocol-contracts\/providers\/bundle$/ }, () => ({ path: stubPath }));
        build.onResolve({ filter: /protocol-contracts\/(dest|src)\/provider\/bundle\.(js|ts)$/ }, () => ({
          path: stubPath,
        }));
      },
    },
    // Redirect `@aztec/archiver` to a minimal stub that re-exports only the three symbols
    // TXE actually uses (`ArchiverDataSourceBase`, `ArchiverDataStoreUpdater`,
    // `createArchiverDataStores`). The package's barrel re-exports 18 modules without
    // `sideEffects: false`, so the eager bundle otherwise pulls in `archiver.js`, `factory.js`
    // (drags `l1_synchronizer.js`), `store/block_store.js`, `store/log_store.js`, and the
    // l1 retrieval code — together ~150 KiB that the TXE worker never executes.
    {
      name: 'aztec-archiver-stub',
      setup(build) {
        const stubPath = new URL('./src/stubs/archiver_stub.ts', import.meta.url).pathname;
        build.onResolve({ filter: /^@aztec\/archiver$/ }, () => ({ path: stubPath }));
      },
    },
    // Redirect `@aztec/bb-prover/test` to a stub that re-exports only `TestCircuitVerifier`.
    // The barrel also exports `TestCircuitProver`, which transitively pulls in the prover-
    // server stack (`bb-prover/server/bb_prover.js`, ~24 KiB) — TXE never proves, so we drop
    // the prover entirely.
    {
      name: 'bb-prover-test-stub',
      setup(build) {
        const stubPath = new URL('./src/stubs/bb_prover_test_stub.ts', import.meta.url).pathname;
        build.onResolve({ filter: /^@aztec\/bb-prover\/test$/ }, () => ({ path: stubPath }));
      },
    },
    // Stub `aztec-node/dest/sentinel/factory.js` + `sentinel.js`. The validator-set "sentinel"
    // subsystem is constructed and started inside `AztecNodeService.start()`, a code path TXE
    // never invokes (TXE constructs the node directly via `new AztecNodeService(...)` with
    // sentinel = undefined). Throwing trap stubs satisfy the imports without bundling the
    // sentinel + its KV store. The `instrumentation.js` shim handles `node_metrics.js`'s
    // sibling chain that the sentinel's metric registration would otherwise drag in.
    // Stub `aztec-node/aztec-node/node_metrics.js` — TXE constructs `AztecNodeService` so
    // this class is instantiated, but the metric record-paths inside it are never reached
    // by the TXE foreign-call flow. Real `NodeMetrics` triggers a static import of
    // `@aztec/telemetry-client/metrics` (~66 KiB) to read `Metrics.NODE_*` constants; the
    // no-op stub drops that without affecting any reachable code path.
    {
      name: 'aztec-node-node-metrics-stub',
      setup(build) {
        const stubPath = new URL('./src/stubs/aztec_node_node_metrics_stub.ts', import.meta.url).pathname;
        build.onResolve({ filter: /^\.\/node_metrics\.(js|ts)$/ }, args => {
          if (!args.importer.includes('/aztec-node/')) return null;
          return { path: stubPath };
        });
      },
    },
    {
      name: 'aztec-node-sentinel-stub',
      setup(build) {
        const factoryStub = new URL('./src/stubs/aztec_node_sentinel_factory_stub.ts', import.meta.url).pathname;
        const sentinelStub = new URL('./src/stubs/aztec_node_sentinel_stub.ts', import.meta.url).pathname;
        // `aztec-node/server.js` uses relative imports (`../sentinel/factory.js`,
        // `../sentinel/sentinel.js`) which esbuild presents to `onResolve` as the original
        // specifier — we match the tail and gate by the importer being inside aztec-node so
        // we don't accidentally hijack same-named files in another package.
        build.onResolve({ filter: /^\.\.\/sentinel\/factory\.(js|ts)$/ }, args => {
          if (!args.importer.includes('/aztec-node/')) return null;
          return { path: factoryStub };
        });
        build.onResolve({ filter: /^\.\.\/sentinel\/sentinel\.(js|ts)$/ }, args => {
          if (!args.importer.includes('/aztec-node/')) return null;
          return { path: sentinelStub };
        });
      },
    },
    // Redirect the `@aztec/world-state` package barrel (the bare specifier) to a throw-stub.
    // `aztec-node/server.js` is the only consumer in the TXE bundle and only uses
    // `createWorldState` + `createWorldStateSynchronizer` inside `AztecNodeService.start()`,
    // a code path TXE never invokes. Stubbing the barrel drops ~22 KiB of
    // `server_world_state_synchronizer.js` + factory + `world-state-db/*` from the eager
    // chunk. TXE's own imports use the `/native` subpath, which is left untouched.
    {
      name: 'world-state-stub',
      setup(build) {
        const stubPath = new URL('./src/stubs/world_state_stub.ts', import.meta.url).pathname;
        build.onResolve({ filter: /^@aztec\/world-state$/ }, () => ({ path: stubPath }));
      },
    },
    // Redirect the `@aztec/bb-prover` package barrel itself to a throw-stub bundle. Only
    // `AztecNodeService`'s server.js statically references three verifier classes from the
    // barrel, and TXE never reaches the code paths that instantiate them — so we provide
    // identifier-only classes that throw on construction. This drops the entire
    // `./prover`, `./verifier`, `./bb`, `./honk`, and `./verification_key` re-exports
    // (`test_circuit_prover.js` 19 KiB, `bb_prover.js` 24 KiB, plus VK data) from the
    // eager startup chunk.
    {
      name: 'bb-prover-stub',
      setup(build) {
        const stubPath = new URL('./src/stubs/bb_prover_stub.ts', import.meta.url).pathname;
        build.onResolve({ filter: /^@aztec\/bb-prover$/ }, () => ({ path: stubPath }));
      },
    },
    // Redirect `@noble/curves/secp256k1` to a stub. The real module precomputes the secp256k1
    // group/field tables at import. Only `foundation/eth-signature` uses it (for sign/verify/
    // recover), and TXE never verifies an L1 signature — stdlib types only hold `Signature` as
    // a serializable value, never call its math methods.
    {
      name: 'noble-secp256k1-stub',
      setup(build) {
        const stubPath = new URL('./src/stubs/noble_secp256k1_stub.ts', import.meta.url).pathname;
        build.onResolve({ filter: /^@noble\/curves\/secp256k1$/ }, () => ({ path: stubPath }));
      },
    },
    // Redirect `@noble/curves/bls12-381` to a stub. The real module precomputes Fp2 tower
    // tables at import (~150 ms per worker). TXE never executes BLS12 arithmetic; stdlib's
    // rollup types reference `BLS12Point` only for `instanceof`/Zod schema purposes.
    {
      name: 'noble-bls12-stub',
      setup(build) {
        const stubPath = new URL('./src/stubs/noble_bls12_stub.ts', import.meta.url).pathname;
        build.onResolve({ filter: /^@noble\/curves\/bls12-381$/ }, () => ({ path: stubPath }));
      },
    },
    // Redirect telemetry-client's `start.ts` to a Noop-only stub. The real start.ts has
    // `await import('./otel.js')`, which forces esbuild to emit a 1.2 MiB chunk for the
    // OpenTelemetry SDK even though TXE never calls `initTelemetryClient`.
    {
      name: 'telemetry-start-stub',
      setup(build) {
        const stubPath = new URL('./src/stubs/telemetry_start_stub.ts', import.meta.url).pathname;
        build.onResolve({ filter: /telemetry-client\/(dest|src)\/start\.(js|ts)$/ }, () => ({ path: stubPath }));
        // `./start.js` from within telemetry-client/dest/ (relative imports inside start's
        // siblings like telemetry.js, otel_propagation.js, wrappers/fetch.js).
        build.onResolve({ filter: /^\.\.?\/start\.js$/ }, args => {
          if (!args.importer.includes('/telemetry-client/')) return null;
          return { path: stubPath };
        });
      },
    },
    // Redirect zod's locales barrel to a stub that exports only `en`. Without this, esbuild
    // pulls in ~30 KiB of i18n bundles (ar, az, be, bg, …) that TXE never surfaces. The import
    // arrives as a relative `"../locales/index.js"` from inside zod, so we filter on the path
    // tail and gate by importer.
    {
      name: 'zod-locales-stub',
      setup(build) {
        const stubPath = new URL('./src/stubs/zod_locales_stub.ts', import.meta.url).pathname;
        build.onResolve({ filter: /locales\/index\.js$/ }, args => {
          if (!args.importer.includes('/zod/')) return null;
          return { path: stubPath };
        });
      },
    },
  ],
  // esbuild's `__require` helper looks for a top-level `require` binding in the bundle and falls
  // back to throwing `Dynamic require of "X" is not supported` if absent. We must provide one for
  // bundled CJS deps (e.g. pino's `require('node:os')`). Imported under a renamed alias so we do
  // not collide with bundled CJS modules that also declare `createRequire`.
  banner: {
    js: [
      `import { createRequire as __txeCreateRequire } from 'node:module';`,
      `const require = __txeCreateRequire(import.meta.url);`,
    ].join('\n'),
  },
  // Strip whitespace and dead code, but do *not* rename identifiers — at least one of our
  // bundled dependencies relies on global identifier names (we saw "position is not defined"
  // when full `minify: true` was on). Whitespace+syntax minification still trims ~25% off the
  // parse cost and is safe.
  minifyWhitespace: true,
  minifySyntax: true,
  keepNames: true,
  // External sourcemap keeps the runtime bundles small — V8 only parses the .js, and Node loads
  // the .map lazily when a stack trace needs it.
  sourcemap: 'external',
  logLevel: 'info',
  metafile: true,
});

await writeFile_('dest/metafile.json', JSON.stringify(result.metafile, null, 2));

const totalBytes = Object.values(result.metafile.outputs).reduce((sum, o) => sum + o.bytes, 0);
const ms = Date.now() - start;
// eslint-disable-next-line no-console
console.log(`Bundled TXE in ${ms}ms (${(totalBytes / 1024 / 1024).toFixed(1)} MiB total)`);

// Surface the heaviest inputs per bundle so it's easy to spot when a contract artifact or other
// large blob drifts in. Pass `--inspect` on the command line to get the breakdown.
if (process.argv.includes('--inspect')) {
  for (const [outPath, out] of Object.entries(result.metafile.outputs)) {
    if (!outPath.endsWith('.js')) {
      continue;
    }
    // eslint-disable-next-line no-console
    console.log(`\n${outPath} (${(out.bytes / 1024 / 1024).toFixed(1)} MiB) — top 15 contributors:`);
    const inputs = Object.entries(out.inputs)
      .sort(([, a], [, b]) => b.bytesInOutput - a.bytesInOutput)
      .slice(0, 40);
    for (const [path, info] of inputs) {
      // eslint-disable-next-line no-console
      console.log(`  ${(info.bytesInOutput / 1024 / 1024).toFixed(2).padStart(6)} MiB  ${path}`);
    }
  }
}
