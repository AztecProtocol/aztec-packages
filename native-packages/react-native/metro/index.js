// @ts-check
/**
 * Metro configuration for an app using Aztec's client stack (a labs PXE, bb.js, Noir): in metro.config.js,
 *
 *   const { withAztec } = require('@aztec-foundation/react-native/metro');
 *   module.exports = withAztec(getDefaultConfig(__dirname));
 *
 * It resolves Node's built-in modules, which parts of the stack import, to what React Native can run (the
 * stack's browser builds need the same of a web bundler), resolves Noir's acvm_js and noirc_abi, which are wasm
 * modules, to their API over the ACVM's native library (js/noir), resolves ohash's and hash.js's SHA-256 to the native one
 * (Hermes has no JIT; the PXE hashes every contract artifact and every value it stores), and transforms `export * as` (zod 4), which React
 * Native's Babel preset leaves alone.
 */
const fs = require('fs');
const path = require('path');

/**
 * Node builtins the stack imports, and what they resolve to in the app: a package (one copy of it for the whole
 * app, this package's, so a fix-up of it reaches every importer), or null for an empty module.
 */
const NODE_BUILTINS = {
  assert: null,
  async_hooks: null,
  buffer: 'buffer',
  child_process: null,
  crypto: null,
  events: 'events',
  fs: null,
  'fs/promises': null,
  http: null,
  https: null,
  module: null,
  net: null,
  os: null,
  path: null,
  perf_hooks: null,
  process: null,
  stream: null,
  string_decoder: null,
  timers: null,
  tty: null,
  url: null,
  util: 'util',
  v8: null,
  vm: null,
  worker_threads: null,
  zlib: null,
};

const EMPTY_MODULE = path.join(__dirname, 'empty.js');
const PACKAGE_ROOT = path.join(__dirname, '..');
const HASH_JS_SHIM = fs.realpathSync(path.join(__dirname, 'hash_js.js'));

/** Noir's wasm packages, and their API over the ACVM's native library. */
const NOIR_MODULES = {
  '@aztec-foundation/noir-acvm_js': path.join(PACKAGE_ROOT, 'js/noir/acvm_js.js'),
  '@aztec-foundation/noir-noirc_abi': path.join(PACKAGE_ROOT, 'js/noir/noirc_abi.js'),
};

/**
 * @param {any} config The app's Metro config (from `getDefaultConfig`).
 * @returns {any} The config, extended.
 */
function withAztec(config) {
  const upstreamResolveRequest = config.resolver?.resolveRequest;
  process.env.AZTEC_RN_UPSTREAM_BABEL_TRANSFORMER =
    config.transformer?.babelTransformerPath ?? require.resolve('@react-native/metro-babel-transformer');
  return {
    ...config,
    resolver: {
      ...config.resolver,
      resolveRequest(context, moduleName, platform) {
        if (Object.prototype.hasOwnProperty.call(NOIR_MODULES, moduleName)) {
          return { type: 'sourceFile', filePath: NOIR_MODULES[/** @type {keyof typeof NOIR_MODULES} */ (moduleName)] };
        }
        if (moduleName === 'ohash/crypto') {
          return { type: 'sourceFile', filePath: path.join(__dirname, 'ohash_crypto.js') };
        }
        if (moduleName === 'hash.js' && fs.realpathSync(context.originModulePath) !== HASH_JS_SHIM) {
          return { type: 'sourceFile', filePath: HASH_JS_SHIM };
        }
        const name = moduleName.startsWith('node:') ? moduleName.slice(5) : moduleName;
        if (Object.prototype.hasOwnProperty.call(NODE_BUILTINS, name)) {
          const target = NODE_BUILTINS[/** @type {keyof typeof NODE_BUILTINS} */ (name)];
          return {
            type: 'sourceFile',
            filePath: target === null ? EMPTY_MODULE : require.resolve(`${target}/`, { paths: [PACKAGE_ROOT] }),
          };
        }
        return upstreamResolveRequest
          ? upstreamResolveRequest(context, moduleName, platform)
          : context.resolveRequest(context, moduleName, platform);
      },
    },
    transformer: {
      ...config.transformer,
      babelTransformerPath: path.join(__dirname, 'babel_transformer.js'),
    },
  };
}

module.exports = { withAztec, NODE_BUILTINS };
