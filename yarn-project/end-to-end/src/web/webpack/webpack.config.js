import CopyPlugin from 'copy-webpack-plugin';
import { createRequire } from 'module';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import webpack from 'webpack';

const require = createRequire(import.meta.url);

const src = resolve(dirname(fileURLToPath(import.meta.url)));
const out = resolve(src, 'dist');

export default {
  target: 'web',
  mode: 'production',
  devtool: false,
  entry: resolve(src, 'main.ts'),
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: resolve(src, './tsconfig.json'),
            },
          },
        ],
      },
    ],
  },
  output: {
    path: out,
    filename: 'main.js',
    library: {
      type: 'module',
    },
    chunkFormat: 'module',
  },
  experiments: {
    outputModule: true,
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify('production'),
      },
    }),
    new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] }),
    new CopyPlugin({ patterns: [resolve(src, 'index.html')] }),
  ],
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      // All node specific code, wherever it's located, should be imported as below.
      // Provides a clean and simple way to always strip out the node code for the web build.
      './node/index.js': false,
    },
    fallback: {
      crypto: false,
      os: false,
      fs: false,
      path: false,
      url: false,
      worker_threads: false,
      buffer: require.resolve('buffer/'),
      util: require.resolve('util/'),
      stream: require.resolve('stream-browserify'),
      tty: require.resolve('tty-browserify'),
    },
  },
};
