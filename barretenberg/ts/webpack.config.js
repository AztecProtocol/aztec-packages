import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import webpack from 'webpack';
import TerserPlugin from 'terser-webpack-plugin';

/**
 * @type {import('webpack').Configuration}
 */
export default {
  target: 'web',
  mode: 'production',
  // Useful for debugging.
  // mode: 'development',
  // devtool: 'source-map',
  entry: {
    index: './src/index.ts',
    // Force inclusion of inlined wasm files without mangling await import statements.
    barretenberg: { import: './src/barretenberg_wasm/fetch_code/browser/barretenberg.ts', filename: 'barretenberg.js' },
    "barretenberg-threads": { import: './src/barretenberg_wasm/fetch_code/browser/barretenberg-threads.ts', filename: 'barretenberg-threads.js' },
    // // Force inclusion of worker threads without mangling worker import statements.
    // main: { import: './src/barretenberg_wasm/barretenberg_wasm_main/factory/browser/main.worker.ts', filename: 'main.worker.js' },
    // thread: { import: './src/barretenberg_wasm/barretenberg_wasm_thread/factory/browser/thread.worker.ts', filename: 'thread.worker.js' },
  },
  module: {
    rules: [
      {
        test: /\.wasm\.gz$/,
        type: 'asset/inline',
      },
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: { configFile: 'tsconfig.browser.json', onlyCompileBundledFiles: true },
          },
        ],
      },
    ],
  },
  output: {
    path: resolve(dirname(fileURLToPath(import.meta.url)), './dest/browser'),
    filename: '[name].js',
    chunkFilename: '[name].[chunkhash].js',
    module: true,
    globalObject: 'globalThis',
    library: {
      type: 'module',
    },
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: false,
          sourceMap: true,
          mangle: false,
          format: {
            beautify: true
          }
        },
      }),
    ],
    splitChunks: {
      // Cannot use async due to https://github.com/webpack/webpack/issues/17014
      // messing with module workers loaded asynchronously.
      chunks: /barretenberg.*.js/,
    },
    runtimeChunk: false
  },
  experiments: {
    outputModule: true,
  },
  plugins: [
    new webpack.DefinePlugin({ 'process.env.NODE_DEBUG': false }),
    new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] }),
    new webpack.NormalModuleReplacementPlugin(/\/node\/(.*)\.js$/, function (resource) {
      resource.request = resource.request.replace('/node/', '/browser/');
    }),
  ],
  resolve: {
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
    fallback: {
      os: false,
    },
    alias: {
      // All node specific code, wherever it's located, should be imported as below.
      // Provides a clean and simple way to always strip out the node code for the web build.
      './node/index.js': false,
    }
  },
  devServer: {
    hot: false,
    client: {
      logging: 'none',
      overlay: false,
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
};
