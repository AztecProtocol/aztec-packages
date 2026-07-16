// Bundles the TXE entry points (bin/index.ts + worker.ts + rpc_server.ts) into single files so
// each Node isolate — main thread and worker_threads alike — compiles one file at startup instead
// of resolving the full TXE → simulator → world-state → bb-prover dependency tree from scratch.
// This is the dominant cost of cold-starting TXE.
//
// Native modules (LMDB, @aztec/native, msgpackr, snappy, etc.) and packages that load their own
// .wasm assets at runtime (@aztec/noir-acvm_js, @aztec/noir-noirc_abi, @aztec/bb.js) stay
// external — esbuild cannot bundle .node binaries, and bundling the WASM-loader JS would break
// relative paths to the .wasm files.
//
import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';

import { externalNativePlugin } from './esbuild/plugins/external_native.mjs';
import { protocolContractsEagerToLazyPlugin } from './esbuild/plugins/protocol_contracts_eager_to_lazy.mjs';
import { redirectsPlugin } from './esbuild/plugins/redirects.mjs';
import { enforceSizeLimits } from './esbuild/plugins/size_guard.mjs';
import { stripArtifactDebugPlugin } from './esbuild/plugins/strip_artifact_debug.mjs';

// `@aztec/*` packages that `@aztec/archiver` imports transitively but the TXE worker never
// actually constructs or executes — TXEArchiver only uses the archiver's data-store layer, so the
// L1-facing symbols are never reached. The Proxy-based `empty_stub.cjs` throws on access,
// surfacing any false assumption loudly.
//
// NOTE: `@aztec/archiver` is intentionally NOT stubbed — TXEArchiver extends ArchiverDataSourceBase
//       and uses createArchiverDataStores at runtime.
// NOTE: `@aztec/blob-lib` is NOT stubbed — stdlib's tx_effect calls getNumTxBlobFields at runtime
//       when serializing transactions.
const fullyStubbedAztecPackages = ['@aztec/epoch-cache', '@aztec/blob-client'];

// Each row redirects a specifier match to a stub file under `esbuild/stubs/`. The local stub
// re-exports only the surface the bundled code reaches at runtime, or throws on call for code
// paths TXE never enters (see `throwTrap` in foundation/error). For relative-path filters,
// `importerContains` gates by importer path so we don't hijack same-named files in other
// packages.
const redirects = [
  // Whole-package redirects (bare specifier + every subpath → shared Proxy stub).
  {
    filter: new RegExp(`^(${fullyStubbedAztecPackages.map(p => p.replace(/[/-]/g, '[\\/\\-]')).join('|')})(/.*)?$`),
    stub: 'empty_stub.cjs',
  },

  // Bare-specifier redirects: each package has its own bespoke stub re-exporting just what the
  // bundled code uses. The real packages either drag in heavy transitive deps the TXE worker
  // never executes (telemetry HTTP wrappers, archiver factory + L1 retrieval, world-state
  // synchronizer, bb prover/verifier stack) or eagerly precompute large lookup tables at import
  // (noble curve field-tower tables).
  { filter: /^@aztec\/telemetry-client$/, stub: 'telemetry_stub.ts' },
  { filter: /^@aztec\/protocol-contracts\/providers\/bundle$/, stub: 'protocol_contracts_bundle_stub.ts' },
  { filter: /^@aztec\/archiver$/, stub: 'archiver_stub.ts' },
  { filter: /^@aztec\/bb-prover$/, stub: 'bb_prover_stub.ts' },
  { filter: /^@aztec\/world-state$/, stub: 'world_state_stub.ts' },
  { filter: /^@noble\/curves\/secp256k1$/, stub: 'noble_secp256k1_stub.ts' },
  { filter: /^@noble\/curves\/bls12-381$/, stub: 'noble_bls12_stub.ts' },

  // Relative-path redirects with importer gating: a specific file inside a package would
  // otherwise pull in heavy unused code, but we can't wholesale stub the package (it has live
  // siblings TXE still needs).
  //
  // - telemetry-client/.../start.js: contains `await import('./otel.js')` which forces emission
  //   of a large OpenTelemetry SDK chunk even though TXE never starts telemetry.
  // - zod/.../locales/index.js: barrel re-exports every i18n bundle; TXE only needs `en`.
  //
  // start.js arrives as a resolved absolute path from outside the package…
  { filter: /telemetry-client\/(dest|src)\/start\.(js|ts)$/, stub: 'telemetry_start_stub.ts' },
  // …and as a relative `./start.js` from siblings inside the package.
  {
    filter: /^\.\.?\/start\.js$/,
    importerContains: '/telemetry-client/',
    stub: 'telemetry_start_stub.ts',
  },
  { filter: /locales\/index\.js$/, importerContains: '/zod/', stub: 'zod_locales_stub.ts' },
  // Resolved-path form of providers/bundle.js (the bare-specifier form is matched above).
  {
    filter: /protocol-contracts\/(dest|src)\/provider\/bundle\.(js|ts)$/,
    stub: 'protocol_contracts_bundle_stub.ts',
  },
];

const entryPoints = {
  // src/bin/index.ts → dest/bin/index.js (overwrites the tsc-emitted file).
  'bin/index': 'src/bin/index.ts',
  // src/worker.ts → dest/worker.bundle.js (the file the pool spawns).
  'worker.bundle': 'src/worker.ts',
  // src/rpc_server.ts → dest/server.bundle.js (the entry the parent `@aztec/aztec`
  // CLI imports via `@aztec/txe/server`).
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
    // parseDebugSymbols — pako never executes. Externalizing keeps the inflate impl out of the
    // eager startup chunk; if it ever IS reached, Node will resolve it from node_modules.
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
    // Artifacts the TXE worker never executes (rollup, parity, kernel circuits, VKs). They ship
    // as large JSON files and get re-exported from a barrel without proper `sideEffects: false`,
    // so esbuild can't tree-shake them. Externalizing the whole package keeps them off the
    // worker's startup parse path.
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
    // Same reasoning: stdlib/p2p/signature_utils and archiver/l1 statically import `viem` for
    // L1 RPC + signing primitives. Neither code path executes in TXE, so externalize the whole
    // tree.
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
    redirectsPlugin(redirects),
    stripArtifactDebugPlugin,
    protocolContractsEagerToLazyPlugin,
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
  // Strip whitespace and dead code, but do *not* rename identifiers — at least one of our bundled
  // dependencies relies on global identifier names (we saw "position is not defined" when full
  // `minify: true` was on). Whitespace+syntax minification still trims parse cost and is safe.
  minifyWhitespace: true,
  minifySyntax: true,
  keepNames: true,
  // External sourcemap keeps the runtime bundles small — V8 only parses the .js, and Node loads
  // the .map lazily when a stack trace needs it.
  sourcemap: 'external',
  logLevel: 'info',
  metafile: true,
});

// Dump the full metafile so we can audit chunk graph / imports separately from the build.
await writeFile('dest/metafile.json', JSON.stringify(result.metafile, null, 2));

const totalBytes = Object.values(result.metafile.outputs).reduce((sum, o) => sum + o.bytes, 0);
const ms = Date.now() - start;
// eslint-disable-next-line no-console
console.log(`Bundled TXE in ${ms}ms (${(totalBytes / 1024 / 1024).toFixed(1)} MiB total)`);

// Surface the heaviest inputs per bundle. Pass `--inspect` on the command line to print.
if (process.argv.includes('--inspect')) {
  for (const [outPath, out] of Object.entries(result.metafile.outputs)) {
    if (!outPath.endsWith('.js')) {
      continue;
    }
    // eslint-disable-next-line no-console
    console.log(`\n${outPath} (${(out.bytes / 1024 / 1024).toFixed(1)} MiB) — top 40 contributors:`);
    const inputs = Object.entries(out.inputs)
      .sort(([, a], [, b]) => b.bytesInOutput - a.bytesInOutput)
      .slice(0, 40);
    for (const [path, info] of inputs) {
      // eslint-disable-next-line no-console
      console.log(`  ${(info.bytesInOutput / 1024 / 1024).toFixed(2).padStart(6)} MiB  ${path}`);
    }
  }
}

enforceSizeLimits(result.metafile);
