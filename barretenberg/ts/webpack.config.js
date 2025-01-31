import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import ResolveTypeScriptPlugin from 'resolve-typescript-plugin';
import webpack from 'webpack';

/**
 * @type {import('webpack').Configuration}
 */
export default {
  target: 'web',
  mode: 'production',
  // Useful for debugging.
  // mode: 'development',
  // devtool: 'source-map',
  entry: './src/index.ts',
  module: {
    rules: [
      {
        test: /\.wasm\.gz$/,
        type: 'asset/resource',
        generator: {
          // The wasm filenames are actually the same, but we symlink them to the correct one
          // (threads or not) on the .ts folder. Unfortunately webpack uses the original name,
          // so we have to manually correct it here.
          filename: (path) => {
            if(path.filename.includes('wasm-threads')) {
              return 'barretenberg-threads.wasm.gz';
            }
            return '[base]';
          },
          publicPath: '/'
        }
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
    filename: 'index.js',
    module: true,
    globalObject: 'globalThis',
    library: {
      type: 'module',
    },
  },
  optimization: {
    minimize: false,
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
