import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import ResolveTypeScriptPlugin from 'resolve-typescript-plugin';
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
    // Force inclusion of inlined wasm files withouth mangling await import statements.
    barretenberg: './src/barretenberg_wasm/fetch_code/browser/barretenberg.ts',
    "barretenberg-threads": './src/barretenberg_wasm/fetch_code/browser/barretenberg-threads.ts'
  },
  module: {
    rules: [
      {
        test: /\.wasm\.gz$/,
        type: 'asset/inline',
      },
      {
        test: /\.worker\.ts$/,
        loader: 'worker-loader',
        options: { inline: 'no-fallback' },
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
          mangle: false,
          format: {
            beautify: true
          }
        },
      }),
    ],
    splitChunks: {
      chunks: 'async',
    }
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
    plugins: [new ResolveTypeScriptPlugin()],
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
