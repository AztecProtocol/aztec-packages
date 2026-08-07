import { defineConfig, loadEnv, searchForWorkspaceRoot, Plugin, ResolvedConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { PolyfillOptions, nodePolyfills } from 'vite-plugin-node-polyfills';
import fs from 'fs';
import path from 'path';

// Only required for alternative bb wasm file, left as reference
//import { viteStaticCopy } from 'vite-plugin-static-copy';

// Unfortunate, but needed due to https://github.com/davidmyersdev/vite-plugin-node-polyfills/issues/81
// Suspected to be because of the yarn workspace setup, but not sure
const nodePolyfillsFix = (options?: PolyfillOptions | undefined): Plugin => {
  return {
    ...nodePolyfills(options),
    /* @ts-ignore */
    resolveId(source: string) {
      const m = /^vite-plugin-node-polyfills\/shims\/(buffer|global|process)$/.exec(source);
      if (m) {
        return `./node_modules/vite-plugin-node-polyfills/shims/${m[1]}/dist/index.cjs`;
      }
    },
  };
};

/**
 * Lightweight chunk size validator plugin
 * Checks chunk sizes after build completes and fails if limits are exceeded
 */
interface ChunkSizeLimit {
  /** Pattern to match chunk file names (e.g., /assets\/index-.*\.js$/) */
  pattern: RegExp;
  /** Maximum size in kilobytes */
  maxSizeKB: number;
  /** Optional description for logging */
  description?: string;
}

const chunkSizeValidator = (limits: ChunkSizeLimit[]): Plugin => {
  let config: ResolvedConfig;

  return {
    name: 'chunk-size-validator',
    enforce: 'post',
    apply: 'build',
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    // `writeBundle` is documented to fire AFTER the output bundle has been
    // written to disk, whereas `closeBundle` (which we used previously) is the
    // last hook to run and can fire before any chunks have been flushed in
    // current vite/rollup versions — manifesting as ENOENT on `scandir 'dist'`
    // for a build that otherwise transformed all modules cleanly.
    writeBundle() {
      const outDir = this.meta?.watchMode ? null : 'dist';
      if (!outDir) return; // Skip in watch mode

      const logger = config.logger;
      const violations: string[] = [];
      const checkDir = (dir: string, baseDir: string = '') => {
        const files = fs.readdirSync(dir);

        for (const file of files) {
          const filePath = path.join(dir, file);
          const relativePath = path.join(baseDir, file);
          const stat = fs.statSync(filePath);

          if (stat.isDirectory()) {
            checkDir(filePath, relativePath);
          } else if (stat.isFile()) {
            const sizeKB = stat.size / 1024;

            for (const limit of limits) {
              if (limit.pattern.test(relativePath)) {
                const desc = limit.description ? ` (${limit.description})` : '';
                logger.info(`  ${relativePath}: ${sizeKB.toFixed(2)} KB / ${limit.maxSizeKB} KB${desc}`);

                if (sizeKB > limit.maxSizeKB) {
                  violations.push(
                    `  ❌ ${relativePath}: ${sizeKB.toFixed(2)} KB exceeds limit of ${limit.maxSizeKB} KB${desc}`,
                  );
                }
              }
            }
          }
        }
      };

      logger.info('\n📦 Validating chunk sizes...');
      checkDir(path.resolve(process.cwd(), outDir));

      if (violations.length > 0) {
        logger.error('\n❌ Chunk size validation failed:\n');
        violations.forEach(v => logger.error(v));
        logger.error('\n');
        throw new Error('Build failed: chunk size limits exceeded');
      } else {
        logger.info('✅ All chunks within size limits\n');
      }
    },
  };
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    logLevel: process.env.CI ? 'error' : undefined,
    server: {
      // Headers needed for bb WASM to work in multithreaded mode
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      // Allow vite to serve files from these directories, since they are symlinked
      // These are the protocol circuit artifacts and bb WASMs.
      fs: {
        allow: [
          searchForWorkspaceRoot(process.cwd()),
          '../yarn-project/noir-protocol-circuits-types/artifacts',
          '../barretenberg/ts/bb.js/dest/browser',
        ],
      },
    },
    plugins: [
      react({ jsxImportSource: '@emotion/react' }),
      nodePolyfillsFix({ include: ['buffer', 'path', 'process', 'net', 'tty'] }),
      // This is unnecessary unless BB_WASM_PATH is defined (default would be /assets/barretenberg.wasm.gz)
      // Left as an example of how to use a different bb wasm file than the default lazily loaded one
      // viteStaticCopy({
      //   targets: [
      //     {
      //       src: '../barretenberg/cpp/build-wasm-threads/bin/*.wasm',
      //       dest: 'assets/',
      //     },
      //   ],
      // }),
      chunkSizeValidator([
        // Bump log:
        // - AD: bumped from 1600 => 1680 as we now have a 20kb msgpack lib in bb.js and other logic got us 50kb higher, adding some wiggle room.
        // - MW: bumped from 1700 => 1750 after adding the noble curves pkg to foundation required for blob batching calculations.
        // - 2026-05-08: bumped from 1750 => 1800 after merge of next into merge-train/fairies brought in barretenberg changes (optimized Poseidon2, n1 apps) that nudged bb.js over the prior limit (1750.02 KB).
        // - JB: bumped from 1750 => 1800 after adding the `aztec_utl_getTxEffect` oracle handler, which pulls TxEffect / FlatPublicLogs / PrivateLog / PublicDataWrite into the eager PXE import path (#22979).
        // - 2026-05-12: bumped from 1800 => 1850 after merge-train/barretenberg brought in further bb-side changes (multi-app kernel circuits #23076 etc.) that pushed the main entrypoint to 1801.31 KB, just over the limit raised four days earlier.
        // - 2026-06-08: bumped from 1850 => 1925 after aztec RPC namespace / client surface changes pushed the main entrypoint to 1872.57 KB on CI (playground cold build).
        {
          pattern: /assets\/index-.*\.js$/,
          maxSizeKB: 1925,
          description: 'Main entrypoint, hard limit',
        },
        // Bump log:
        // - Dec 2025: bumped from 4000 => 4500 as SimpleToken artifact grew to ~4485 KB causing CI build failures. This
        // raise in artifact size was caused by the BalanceSet state variable being moved to a separate crate in this
        // PR: https://github.com/AztecProtocol/aztec-packages/pull/18782.
        // Not sure why this triggered raise in artifact size, but will not deal with this now as Grego's feedback is
        // greatly needed here.
        // - Dec 2025: bumped from 4500 --> 4600 as SimpleToken grew a bit again.
        // PR: https://github.com/AztecProtocol/aztec-packages/pull/18815
        // - 2026-06-18: bumped from 4600 => 4700 after rebuilding the bb.js browser package at its new
        //   barretenberg/ts/bb.js path produced assets/barretenberg-*.js at 4641.65 KB.
        // - 2026-07-02: bumped to 5000 after merging from public to private repo resulted in 4800+k for some reason.
        // - 2026-07-04: bumped from 5000 => 5300 after bb changes on merge-train/barretenberg grew
        //   assets/barretenberg-*.js to 5079.12 KB and assets/barretenberg-threads-*.js to 5116.65 KB.
        {
          pattern: /.*/,
          maxSizeKB: 5300,
          description: 'Detect if json artifacts or bb.js wasm get out of control',
        },
      ]),
    ],
    define: {
      'process.env': JSON.stringify({
        LOG_LEVEL: env.LOG_LEVEL,
        // The path to a custom WASM file for bb.js.
        // Only the single-threaded file name is needed, the multithreaded file name will be inferred
        // by adding the -threads suffix: e.g: /assets/barretenberg.wasm.gz -> /assets/barretenberg-threads.wasm.gz
        // Files can be compressed or uncompressed, but must be gzipped if compressed.
        BB_WASM_PATH: env.BB_WASM_PATH,
      }),
    },
  };
});
