import HtmlWebpackPlugin from 'html-webpack-plugin';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import ResolveTypeScriptPlugin from 'resolve-typescript-plugin';
import { fileURLToPath } from 'url';
import webpack from 'webpack';

const require = createRequire(import.meta.url);

export default {
  target: 'web',
  mode: 'production',
  entry: {
    index: './src/serve.ts',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        // The bundle's only entry is src/serve.ts; we don't need ts-loader
        // to type-check the rest of the monorepo (test files, sibling
        // packages whose codegen hasn't run, etc.). Type errors from
        // tsc.sh are the source of truth; this just gets the bundle
        // built.
        options: { transpileOnly: true },
      },
    ],
  },
  output: {
    path: resolve(dirname(fileURLToPath(import.meta.url)), './dist'),
    filename: '[name].js',
    chunkFilename: '[name].chunk.js', // This naming pattern is used for chunks produced from code-splitting.
  },
  plugins: [
    new HtmlWebpackPlugin({ inject: false, template: './src/index.html' }),
    new webpack.DefinePlugin({
      'process.env.NODE_DEBUG': false,
    }),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: require.resolve('process/browser.js'),
    }),
  ],
  resolve: {
    plugins: [new ResolveTypeScriptPlugin()],
    // Force the browser export of @aztec/bb.js (with the WebGPU MSM bridge
    // and worker-based WASM). Webpack's exports-field resolution picks
    // node-cjs here because the yarn portal protocol short-circuits the
    // conditional-export pickoff for some webpack versions; alias straight
    // to the browser bundle.
    alias: {
      '@aztec/bb.js$': resolve(dirname(fileURLToPath(import.meta.url)), '../../barretenberg/ts/dest/browser/index.js'),
    },
    fallback: {
      tty: false,
      os: false,
      buffer: require.resolve('buffer/'),
      process: require.resolve('process/browser.js'),
    },
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
